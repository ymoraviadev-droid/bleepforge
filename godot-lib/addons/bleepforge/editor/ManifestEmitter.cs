// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#if TOOLS
#nullable enable

namespace Bleepforge.Editor;

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Godot;

/// <summary>
/// Reflects over the user's <see cref="BleepforgeResource"/> subclasses
/// + their corresponding registry classes, builds a
/// <see cref="ManifestModel.Manifest"/>, and writes it to
/// <c>bleepforge_manifest.json</c> at the Godot project root.
///
/// <para>
/// Discovery walks all loaded assemblies for types whose base chain
/// includes one of the four registry generics
/// (<see cref="BleepforgeRegistry{T}"/>, <see cref="BleepforgeFolderedRegistry{T}"/>,
/// <see cref="BleepforgeDiscriminatedRegistry{TBase}"/>,
/// <see cref="BleepforgeEnumRegistry{TEnum, T}"/>). The most-specific
/// matching base picks the entry kind. Resource type comes from the
/// registry's generic parameter; domain name comes from the registry's
/// class name (with a <see cref="BleepforgeDomainAttribute"/> override).
/// </para>
///
/// <para>
/// Field types are inferred from the C# type + <c>[Export]</c> hints
/// where unambiguous (Texture2D → texture, PackedScene → scene, enum →
/// enum, etc.). The few cases the type system can't express are covered
/// by attributes from <see cref="Bleepforge"/>:
/// <see cref="BleepforgeFlagAttribute"/>, <see cref="BleepforgeShowWhenAttribute"/>,
/// <see cref="BleepforgeArrayContainerAttribute"/>, <see cref="BleepforgeNullableAttribute"/>,
/// <see cref="BleepforgeViewAttribute"/>, <see cref="BleepforgeOverrideUiAttribute"/>.
/// </para>
///
/// <para>
/// Sub-resource types (Resource subclasses that are NOT BleepforgeResource
/// subclasses, referenced from a BleepforgeResource field) are discovered
/// transitively while walking fields. Each unique sub-resource gets one
/// entry in the manifest's <c>subResources</c> array, including its own
/// <c>fields</c> + <c>fieldOrder</c>.
/// </para>
///
/// <para>
/// Errors are non-fatal: per-class issues log via <c>GD.PushWarning</c>
/// and the manifest is emitted with the partial data we could collect.
/// Aborting on the first issue would make development painful; the
/// partial manifest tells the user what's missing.
/// </para>
/// </summary>
public sealed class ManifestEmitter
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = null,  // POCOs declare camelCase via [JsonPropertyName]
        Converters = { new JsonStringEnumConverter() },
    };

    /// <summary>
    /// Build the manifest from reflection over loaded assemblies and
    /// write it to <c>bleepforge_manifest.json</c> at the Godot project
    /// root. Returns the absolute path written, or null on hard failure.
    /// </summary>
    public string? EmitToProjectRoot()
    {
        Manifest manifest;
        try
        {
            manifest = BuildManifest();
        }
        catch (Exception ex)
        {
            GD.PushError($"[Bleepforge] Manifest emit aborted: {ex.GetType().Name}: {ex.Message}");
            return null;
        }

        string json;
        try
        {
            json = JsonSerializer.Serialize(manifest, JsonOptions);
        }
        catch (Exception ex)
        {
            GD.PushError($"[Bleepforge] Manifest serialization failed: {ex.Message}");
            return null;
        }

        var resPath = "res://bleepforge_manifest.json";
        var globalPath = ProjectSettings.GlobalizePath(resPath);
        try
        {
            File.WriteAllText(globalPath, json);
        }
        catch (Exception ex)
        {
            GD.PushError($"[Bleepforge] Failed writing manifest to {globalPath}: {ex.Message}");
            return null;
        }

        GD.Print(
            $"[Bleepforge] Manifest emitted: {manifest.Domains.Count} domain(s), " +
            $"{manifest.SubResources.Count} sub-resource(s) → {resPath}");
        return globalPath;
    }

    /// <summary>
    /// Build the manifest in-memory without writing. Useful for tests +
    /// callers that want to inspect before serializing.
    /// </summary>
    public Manifest BuildManifest()
    {
        var manifest = new Manifest();
        var subResourceQueue = new Queue<Type>();
        var subResourceSeen = new HashSet<Type>();
        var resourceToDomain = new Dictionary<Type, string>();

        // Pass 1: discover registries + build the resource → domain name map.
        // Needed up front so ref-type fields can resolve the target domain
        // even when the target's registry hasn't been visited yet.
        var registries = FindRegistrySubclasses().ToList();
        foreach (var registryType in registries)
        {
            var resourceType = ExtractResourceType(registryType);
            if (resourceType == null) continue;
            var domainName = ResolveDomainName(registryType);
            resourceToDomain[resourceType] = domainName;
        }

        // Pass 2: build entries.
        foreach (var registryType in registries)
        {
            try
            {
                var entry = BuildEntry(registryType, resourceToDomain, subResourceQueue, subResourceSeen);
                if (entry != null) manifest.Domains.Add(entry);
            }
            catch (Exception ex)
            {
                GD.PushWarning($"[Bleepforge] Skipped {registryType.FullName}: {ex.Message}");
            }
        }

        // Pass 3: drain sub-resource queue (recursive — sub-resources can
        // reference other sub-resources).
        while (subResourceQueue.Count > 0)
        {
            var subType = subResourceQueue.Dequeue();
            try
            {
                var sub = BuildSubResource(subType, resourceToDomain, subResourceQueue, subResourceSeen);
                manifest.SubResources.Add(sub);
            }
            catch (Exception ex)
            {
                GD.PushWarning($"[Bleepforge] Skipped sub-resource {subType.FullName}: {ex.Message}");
            }
        }

        // Stable ordering for deterministic diffs.
        manifest.Domains.Sort((a, b) => string.Compare(a.DomainName, b.DomainName, StringComparison.Ordinal));
        manifest.SubResources.Sort((a, b) => string.Compare(a.SubResourceName, b.SubResourceName, StringComparison.Ordinal));
        return manifest;
    }

    // ------------------------------------------------------------------
    // Discovery
    // ------------------------------------------------------------------

    /// <summary>
    /// Find every concrete (non-abstract, non-generic-definition) type
    /// in the loaded AppDomain whose base chain includes a closed
    /// generic of one of the four BleepforgeRegistry kinds.
    /// </summary>
    private static IEnumerable<Type> FindRegistrySubclasses()
    {
        var registryGenerics = new[]
        {
            typeof(BleepforgeRegistry<>),
            typeof(BleepforgeFolderedRegistry<>),
            typeof(BleepforgeDiscriminatedRegistry<>),
            typeof(BleepforgeEnumRegistry<,>),
        };

        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            Type[] types;
            try
            {
                types = asm.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                // Some assemblies fail to fully load (missing optional deps);
                // use the partial type list rather than aborting.
                types = ex.Types.Where(t => t != null).ToArray()!;
            }

            foreach (var type in types)
            {
                if (type.IsAbstract || type.IsGenericTypeDefinition) continue;
                if (ChainContainsAnyGeneric(type, registryGenerics))
                {
                    yield return type;
                }
            }
        }
    }

    private static bool ChainContainsAnyGeneric(Type type, Type[] genericDefinitions)
    {
        var current = type.BaseType;
        while (current != null)
        {
            if (current.IsGenericType)
            {
                var def = current.GetGenericTypeDefinition();
                if (genericDefinitions.Contains(def)) return true;
            }
            current = current.BaseType;
        }
        return false;
    }

    /// <summary>
    /// Return the most-specific BleepforgeRegistry kind in the type's
    /// base chain, plus its closed generic args.
    /// </summary>
    private static (Type GenericDef, Type[] Args)? FindRegistryBase(Type type)
    {
        // Order matters: check most-specific first so e.g. a
        // BleepforgeFolderedRegistry subclass isn't reported as a plain
        // BleepforgeRegistry.
        var specificityOrder = new[]
        {
            typeof(BleepforgeEnumRegistry<,>),
            typeof(BleepforgeDiscriminatedRegistry<>),
            typeof(BleepforgeFolderedRegistry<>),
            typeof(BleepforgeRegistry<>),
        };

        foreach (var def in specificityOrder)
        {
            var current = type.BaseType;
            while (current != null)
            {
                if (current.IsGenericType && current.GetGenericTypeDefinition() == def)
                {
                    return (def, current.GetGenericArguments());
                }
                current = current.BaseType;
            }
        }
        return null;
    }

    private static Type? ExtractResourceType(Type registryType)
    {
        var baseInfo = FindRegistryBase(registryType);
        if (baseInfo == null) return null;
        var (def, args) = baseInfo.Value;
        // BleepforgeRegistry<T>, BleepforgeFolderedRegistry<T>,
        // BleepforgeDiscriminatedRegistry<TBase>: T is args[0].
        // BleepforgeEnumRegistry<TEnum, T>: T is args[1].
        if (def == typeof(BleepforgeEnumRegistry<,>)) return args[1];
        return args[0];
    }

    // ------------------------------------------------------------------
    // Entry builders
    // ------------------------------------------------------------------

    private Entry? BuildEntry(
        Type registryType,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue,
        HashSet<Type> subResourceSeen)
    {
        var baseInfo = FindRegistryBase(registryType);
        if (baseInfo == null) return null;
        var (def, _) = baseInfo.Value;
        var resourceType = ExtractResourceType(registryType)!;
        var domainName = ResolveDomainName(registryType);

        if (def == typeof(BleepforgeRegistry<>))
            return BuildDomainEntry(registryType, resourceType, domainName, resourceToDomain, subResourceQueue, subResourceSeen);
        if (def == typeof(BleepforgeFolderedRegistry<>))
            return BuildFolderedEntry(registryType, resourceType, domainName, resourceToDomain, subResourceQueue, subResourceSeen);
        if (def == typeof(BleepforgeDiscriminatedRegistry<>))
            return BuildDiscriminatedEntry(registryType, resourceType, domainName, resourceToDomain, subResourceQueue, subResourceSeen);
        if (def == typeof(BleepforgeEnumRegistry<,>))
            return BuildEnumKeyedEntry(registryType, resourceType, domainName, resourceToDomain, subResourceQueue, subResourceSeen);

        return null;
    }

    private Entry BuildDomainEntry(
        Type registryType, Type resourceType, string domainName,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue, HashSet<Type> subResourceSeen)
    {
        var (fields, order) = BuildFields(resourceType, resourceToDomain, subResourceQueue, subResourceSeen);
        return new Entry
        {
            DomainName = domainName,
            Kind = "domain",
            Class = resourceType.Name,
            Key = ResolveKeyFieldName(registryType, resourceType, fields),
            DisplayName = ResolveDisplayName(fields),
            Folder = InvokeProtectedString(registryType, "GetFolder") ?? "",
            Fields = fields,
            FieldOrder = order,
            View = ResolveView(resourceType),
            OverrideUi = ResolveOverrideUi(resourceType),
        };
    }

    private Entry BuildFolderedEntry(
        Type registryType, Type resourceType, string domainName,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue, HashSet<Type> subResourceSeen)
    {
        var (fields, order) = BuildFields(resourceType, resourceToDomain, subResourceQueue, subResourceSeen);
        var groupModeStr = InvokeProtectedEnum(registryType, "GetGroupMode") ?? "ParentDir";
        var parentNameMustBe = InvokeProtectedString(registryType, "GetParentNameMustBe");
        return new Entry
        {
            DomainName = domainName,
            Kind = "foldered",
            Class = resourceType.Name,
            Key = "(path-derived)",
            DisplayName = ResolveDisplayName(fields),
            FolderDiscovery = new FolderDiscovery
            {
                Mode = "walk",
                GroupBy = groupModeStr == "GrandparentDir" ? "grandparentDir" : "parentDir",
                ParentNameMustBe = parentNameMustBe,
            },
            Fields = fields,
            FieldOrder = order,
            View = ResolveView(resourceType),
            OverrideUi = ResolveOverrideUi(resourceType),
        };
    }

    private Entry BuildDiscriminatedEntry(
        Type registryType, Type baseResourceType, string domainName,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue, HashSet<Type> subResourceSeen)
    {
        // Walk all loaded types for subclasses of baseResourceType.
        var variantTypes = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(a => SafeGetTypes(a))
            .Where(t => t != baseResourceType && baseResourceType.IsAssignableFrom(t) && !t.IsAbstract)
            .ToList();

        var (baseFields, baseOrder) = BuildFields(baseResourceType, resourceToDomain, subResourceQueue, subResourceSeen);

        // Discriminator: find the first enum-typed field on the base.
        // Could also use an attribute for explicitness; for now infer.
        var discriminatorName = baseFields
            .FirstOrDefault(kv => kv.Value.Type == "enum").Key;

        var variants = new List<Variant>();
        foreach (var variantType in variantTypes)
        {
            var (allFields, allOrder) = BuildFields(variantType, resourceToDomain, subResourceQueue, subResourceSeen);
            // Extra fields = fields on variant that aren't on base.
            var extras = allFields
                .Where(kv => !baseFields.ContainsKey(kv.Key))
                .ToDictionary(kv => kv.Key, kv => kv.Value);
            var extraOrder = allOrder.Where(k => extras.ContainsKey(k)).ToList();
            // The variant's discriminator value: try to construct an
            // instance and read the discriminator's value. Fall back to
            // the variant's class name if that fails.
            var variantValue = TryReadDiscriminatorValue(variantType, discriminatorName) ?? variantType.Name;
            variants.Add(new Variant
            {
                Value = variantValue,
                Class = variantType.Name,
                ExtraFields = extras,
                ExtraFieldOrder = extraOrder,
            });
        }

        return new Entry
        {
            DomainName = domainName,
            Kind = "discriminatedFamily",
            Class = baseResourceType.Name,
            Key = ResolveKeyFieldName(registryType, baseResourceType, baseFields),
            DisplayName = ResolveDisplayName(baseFields),
            Folder = InvokeProtectedString(registryType, "GetFolder") ?? "",
            Discriminator = discriminatorName ?? "",
            Base = new BaseDecl
            {
                Class = baseResourceType.Name,
                Fields = baseFields,
                FieldOrder = baseOrder,
            },
            Variants = variants,
            View = ResolveView(baseResourceType),
            OverrideUi = ResolveOverrideUi(baseResourceType),
        };
    }

    private Entry BuildEnumKeyedEntry(
        Type registryType, Type resourceType, string domainName,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue, HashSet<Type> subResourceSeen)
    {
        var (fields, order) = BuildFields(resourceType, resourceToDomain, subResourceQueue, subResourceSeen);
        // TEnum is args[0] of BleepforgeEnumRegistry<TEnum, T>.
        var enumType = FindRegistryBase(registryType)!.Value.Args[0];
        var enumValues = Enum.GetNames(enumType).ToList();
        // Key field name: find the first enum-typed field on the resource
        // matching the registry's TEnum.
        var keyFieldName = fields
            .FirstOrDefault(kv => kv.Value.Type == "enum" && kv.Value.Values?.SequenceEqual(enumValues) == true).Key;

        return new Entry
        {
            DomainName = domainName,
            Kind = "enumKeyed",
            Class = resourceType.Name,
            Key = keyFieldName ?? "(unknown)",
            EnumValues = enumValues,
            DisplayName = ResolveDisplayName(fields),
            Folder = InvokeProtectedString(registryType, "GetFolder") ?? "",
            FolderLayout = "subfolderPerValue",
            Fields = fields,
            FieldOrder = order,
            View = ResolveView(resourceType),
            OverrideUi = ResolveOverrideUi(resourceType),
        };
    }

    // ------------------------------------------------------------------
    // Sub-resource builder
    // ------------------------------------------------------------------

    private SubResource BuildSubResource(
        Type subResType,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue,
        HashSet<Type> subResourceSeen)
    {
        var (fields, order) = BuildFields(subResType, resourceToDomain, subResourceQueue, subResourceSeen);
        return new SubResource
        {
            SubResourceName = subResType.Name,
            Class = subResType.Name,
            StableIdField = "_subId",
            Fields = fields,
            FieldOrder = order,
        };
    }

    // ------------------------------------------------------------------
    // Field discovery
    // ------------------------------------------------------------------

    private (Dictionary<string, FieldDef>, List<string>) BuildFields(
        Type resourceType,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue,
        HashSet<Type> subResourceSeen)
    {
        var fields = new Dictionary<string, FieldDef>();
        var order = new List<string>();
        var defaultsInstance = TryInstantiateForDefaults(resourceType);

        // GetProperties returns in metadata order on .NET 5+. We want
        // properties declared on this type AND its base chain (for
        // discriminated variants that inherit from a base type with
        // its own [Export]s).
        var props = resourceType
            .GetProperties(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(p => p.GetCustomAttribute<ExportAttribute>() != null)
            .ToList();

        foreach (var prop in props)
        {
            try
            {
                var fieldDef = BuildFieldDef(prop, defaultsInstance, resourceToDomain, subResourceQueue, subResourceSeen);
                if (fieldDef == null) continue;
                fields[prop.Name] = fieldDef;
                order.Add(prop.Name);
            }
            catch (Exception ex)
            {
                GD.PushWarning($"[Bleepforge] Skipped field {resourceType.Name}.{prop.Name}: {ex.Message}");
            }
        }

        return (fields, order);
    }

    private FieldDef? BuildFieldDef(
        PropertyInfo prop, object? defaultsInstance,
        Dictionary<Type, string> resourceToDomain,
        Queue<Type> subResourceQueue,
        HashSet<Type> subResourceSeen)
    {
        var propType = prop.PropertyType;
        var def = new FieldDef();

        // Cross-cutting attributes -------------------------------------

        var showWhen = prop.GetCustomAttribute<BleepforgeShowWhenAttribute>();
        if (showWhen != null)
        {
            def.ShowWhen = new Dictionary<string, object>
            {
                [showWhen.OtherField] = showWhen.Values.Length == 1 ? showWhen.Values[0] : showWhen.Values,
            };
        }

        var nullable = prop.GetCustomAttribute<BleepforgeNullableAttribute>() != null;

        // Per-type detection -------------------------------------------

        if (propType == typeof(string))
        {
            if (prop.GetCustomAttribute<BleepforgeFlagAttribute>() != null)
            {
                def.Type = "flag";
            }
            else if (IsMultilineString(prop))
            {
                def.Type = "multiline";
            }
            else
            {
                def.Type = "string";
            }
            def.Default = ReadStringDefault(prop, defaultsInstance);
            return def;
        }

        if (propType == typeof(int) || propType == typeof(long) || propType == typeof(short))
        {
            def.Type = "int";
            def.Default = ReadNumericDefault(prop, defaultsInstance);
            return def;
        }

        if (propType == typeof(float) || propType == typeof(double))
        {
            def.Type = "float";
            def.Default = ReadNumericDefault(prop, defaultsInstance);
            return def;
        }

        if (propType == typeof(bool))
        {
            def.Type = "bool";
            def.Default = ReadBoolDefault(prop, defaultsInstance);
            return def;
        }

        if (propType.IsEnum)
        {
            def.Type = "enum";
            def.Values = Enum.GetNames(propType).ToList();
            def.Default = ReadEnumDefault(prop, defaultsInstance);
            return def;
        }

        if (propType == typeof(Texture2D))
        {
            def.Type = "texture";
            return def;
        }

        if (propType == typeof(PackedScene))
        {
            def.Type = "scene";
            return def;
        }

        // Resource-typed (non-array): ref or single subresource
        if (typeof(Resource).IsAssignableFrom(propType))
        {
            if (typeof(BleepforgeResource).IsAssignableFrom(propType))
            {
                // ref to another domain
                def.Type = "ref";
                def.To = ResolveDomainNameForResource(propType, resourceToDomain);
            }
            else
            {
                // single inline sub-resource
                def.Type = "subresource";
                def.Of = propType.Name;
                if (nullable) def.Nullable = true;
                EnqueueSubResource(propType, subResourceQueue, subResourceSeen);
            }
            return def;
        }

        // Array (T[] or Godot.Collections.Array<T>): element type decides
        // the variant.
        var elementType = TryGetElementType(propType);
        if (elementType != null)
        {
            def.Type = "array";
            var containerAttr = prop.GetCustomAttribute<BleepforgeArrayContainerAttribute>();
            def.ArrayContainerType = containerAttr?.Kind == ArrayContainerKind.Typed ? "typed" : "untyped";
            if (nullable) def.Nullable = true;

            if (typeof(BleepforgeResource).IsAssignableFrom(elementType))
            {
                // Array of refs to another domain
                def.ItemRef = new ItemRefDecl
                {
                    To = ResolveDomainNameForResource(elementType, resourceToDomain),
                };
            }
            else if (typeof(Resource).IsAssignableFrom(elementType))
            {
                // Array of inline sub-resources
                def.Of = elementType.Name;
                EnqueueSubResource(elementType, subResourceQueue, subResourceSeen);
            }
            else
            {
                // Unsupported element type — log + skip.
                GD.PushWarning($"[Bleepforge] Array of {elementType.Name} on {prop.DeclaringType?.Name}.{prop.Name}: only Resource arrays supported in v0.2.6.");
                return null;
            }
            return def;
        }

        // Unhandled type — log + skip.
        GD.PushWarning($"[Bleepforge] Unsupported field type {propType.Name} on {prop.DeclaringType?.Name}.{prop.Name}.");
        return null;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static bool IsMultilineString(PropertyInfo prop)
    {
        var export = prop.GetCustomAttribute<ExportAttribute>();
        if (export == null) return false;
        // PropertyHint.MultilineText is the conventional hint for multiline.
        return export.Hint == PropertyHint.MultilineText;
    }

    private static Type? TryGetElementType(Type propType)
    {
        if (propType.IsArray) return propType.GetElementType();
        if (propType.IsGenericType)
        {
            var def = propType.GetGenericTypeDefinition();
            // Godot.Collections.Array<T> + System.Collections.Generic.List<T>
            if (def == typeof(Godot.Collections.Array<>) || def == typeof(List<>))
            {
                return propType.GetGenericArguments()[0];
            }
        }
        return null;
    }

    private static object? TryInstantiateForDefaults(Type resourceType)
    {
        try
        {
            return Activator.CreateInstance(resourceType);
        }
        catch
        {
            return null;
        }
    }

    private static string? ReadStringDefault(PropertyInfo prop, object? instance)
    {
        if (instance == null) return null;
        var value = prop.GetValue(instance) as string;
        return string.IsNullOrEmpty(value) ? null : value;
    }

    private static object? ReadNumericDefault(PropertyInfo prop, object? instance)
    {
        if (instance == null) return null;
        var value = prop.GetValue(instance);
        if (value == null) return null;
        // Skip natural defaults (0, 0.0).
        if (value is int i && i == 0) return null;
        if (value is long l && l == 0L) return null;
        if (value is short s && s == 0) return null;
        if (value is float f && f == 0f) return null;
        if (value is double d && d == 0d) return null;
        return value;
    }

    private static bool? ReadBoolDefault(PropertyInfo prop, object? instance)
    {
        if (instance == null) return null;
        var value = prop.GetValue(instance);
        if (value is bool b)
        {
            // Only emit when default is true; false is the natural default.
            return b ? true : (bool?)null;
        }
        return null;
    }

    private static string? ReadEnumDefault(PropertyInfo prop, object? instance)
    {
        if (instance == null) return null;
        var value = prop.GetValue(instance);
        if (value == null) return null;
        var name = value.ToString();
        if (string.IsNullOrEmpty(name)) return null;
        // Skip when the value is the enum's first member (the implicit
        // default for unset enum properties).
        var firstName = Enum.GetNames(prop.PropertyType).FirstOrDefault();
        return name == firstName ? null : name;
    }

    private static string ResolveDomainName(Type registryType)
    {
        var attr = registryType.GetCustomAttribute<BleepforgeDomainAttribute>();
        if (attr != null) return attr.Name;

        // Heuristic: strip suffix, lowercase the first character.
        var name = registryType.Name;
        foreach (var suffix in new[] { "Registry", "Database", "Manager" })
        {
            if (name.EndsWith(suffix, StringComparison.Ordinal))
            {
                name = name[..^suffix.Length];
                break;
            }
        }
        return name.Length > 0 ? char.ToLowerInvariant(name[0]) + name[1..] : name;
    }

    private static string ResolveDomainNameForResource(
        Type resourceType, Dictionary<Type, string> resourceToDomain)
    {
        if (resourceToDomain.TryGetValue(resourceType, out var name)) return name;
        // Walk up the inheritance chain — a variant of a discriminated
        // family is wrapped by the registry for the BASE type.
        var current = resourceType.BaseType;
        while (current != null)
        {
            if (resourceToDomain.TryGetValue(current, out var baseName)) return baseName;
            current = current.BaseType;
        }
        // Fallback: derive from class name (matches the registry heuristic).
        var n = resourceType.Name;
        foreach (var suffix in new[] { "Data", "Sequence", "Impact", "Line" })
        {
            if (n.EndsWith(suffix, StringComparison.Ordinal))
            {
                n = n[..^suffix.Length];
                break;
            }
        }
        return n.Length > 0 ? char.ToLowerInvariant(n[0]) + n[1..] : n;
    }

    private static string ResolveKeyFieldName(
        Type registryType, Type resourceType, Dictionary<string, FieldDef> fields)
    {
        // The registry's GetKey method is abstract; we can't read its
        // body via reflection. Instantiate + invoke against a fresh
        // resource to find which field's value matches.
        var instance = TryInstantiate(registryType);
        var resInstance = TryInstantiateForDefaults(resourceType);
        if (instance == null || resInstance == null) return GuessKeyByName(fields);

        try
        {
            var method = registryType.GetMethod(
                "GetKey",
                BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            if (method == null) return GuessKeyByName(fields);
            // Set a probe sentinel on each string field, run GetKey,
            // see which sentinel comes back (composite ids may concat).
            // For simplicity, just guess by name — the registry's GetKey
            // is too dynamic to reflect reliably.
            return GuessKeyByName(fields);
        }
        catch
        {
            return GuessKeyByName(fields);
        }
    }

    private static string GuessKeyByName(Dictionary<string, FieldDef> fields)
    {
        // Common identity field names in priority order.
        foreach (var candidate in new[] { "Id", "Slug", "NpcId", "Faction" })
        {
            if (fields.ContainsKey(candidate)) return candidate;
        }
        return fields.Keys.FirstOrDefault() ?? "";
    }

    private static string? ResolveDisplayName(Dictionary<string, FieldDef> fields)
    {
        foreach (var candidate in new[] { "DisplayName", "Title", "Name" })
        {
            if (fields.ContainsKey(candidate)) return candidate;
        }
        return null;
    }

    private static string ResolveView(Type resourceType)
    {
        var attr = resourceType.GetCustomAttribute<BleepforgeViewAttribute>();
        return attr?.Kind switch
        {
            ViewKind.Cards => "cards",
            ViewKind.Graph => "graph",
            _ => "list",
        };
    }

    private static string? ResolveOverrideUi(Type resourceType)
    {
        var attr = resourceType.GetCustomAttribute<BleepforgeOverrideUiAttribute>();
        return attr?.ComponentName;
    }

    private static object? TryInstantiate(Type type)
    {
        try
        {
            return Activator.CreateInstance(type);
        }
        catch
        {
            return null;
        }
    }

    private static string? InvokeProtectedString(Type type, string methodName)
    {
        var instance = TryInstantiate(type);
        if (instance == null) return null;
        try
        {
            var method = type.GetMethod(
                methodName,
                BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            if (method == null) return null;
            return method.Invoke(instance, null) as string;
        }
        catch
        {
            return null;
        }
    }

    private static string? InvokeProtectedEnum(Type type, string methodName)
    {
        var instance = TryInstantiate(type);
        if (instance == null) return null;
        try
        {
            var method = type.GetMethod(
                methodName,
                BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            if (method == null) return null;
            var result = method.Invoke(instance, null);
            return result?.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static string? TryReadDiscriminatorValue(Type variantType, string? discriminatorName)
    {
        if (string.IsNullOrEmpty(discriminatorName)) return null;
        // Prefer the explicit attribute. C# inheritance makes the
        // instance-default fallback unreliable: every variant inherits
        // the base's default initializer for the discriminator field, so
        // `new Sword()` and `new Shield()` both report the base enum's
        // first value unless each variant reassigns the field. Reading
        // the attribute first avoids that whole class of misclassification.
        var attr = variantType.GetCustomAttribute<BleepforgeVariantValueAttribute>(inherit: false);
        if (attr != null) return attr.Value;
        var instance = TryInstantiate(variantType);
        if (instance == null) return null;
        var prop = variantType.GetProperty(
            discriminatorName,
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (prop == null) return null;
        var value = prop.GetValue(instance);
        return value?.ToString();
    }

    private static void EnqueueSubResource(
        Type subResType, Queue<Type> queue, HashSet<Type> seen)
    {
        if (seen.Add(subResType))
        {
            queue.Enqueue(subResType);
        }
    }

    private static IEnumerable<Type> SafeGetTypes(Assembly asm)
    {
        try
        {
            return asm.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            return ex.Types.Where(t => t != null)!;
        }
    }
}

#endif
