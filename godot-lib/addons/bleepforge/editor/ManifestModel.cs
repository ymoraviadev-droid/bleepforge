// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#if TOOLS
#nullable enable

namespace Bleepforge.Editor;

using System.Collections.Generic;
using System.Text.Json.Serialization;

// POCOs that mirror the manifest JSON shape declared in zod at
// shared/src/manifest.ts. Emit-only — the editor side parses the JSON
// into TypeScript types via zod, not these.
//
// Design choice: flat shape with all possible fields nullable, NOT a
// polymorphic discriminated union. The emitter knows which fields to
// populate per kind, and JsonSerializerOptions.DefaultIgnoreCondition =
// WhenWritingNull strips the unused ones from the output. Trades a
// little compile-time safety for a much simpler model.

/// <summary>
/// The top-level manifest written to <c>bleepforge_manifest.json</c> at
/// the Godot project root.
/// </summary>
public sealed class Manifest
{
    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; set; } = 1;

    [JsonPropertyName("domains")]
    public List<Entry> Domains { get; set; } = new();

    [JsonPropertyName("subResources")]
    public List<SubResource> SubResources { get; set; } = new();
}

/// <summary>
/// One domain entry. Discriminated by <see cref="Kind"/>; per-kind
/// fields are non-null only for the matching kind.
///
/// <para>
/// Common fields (always present): <see cref="Domain"/>, <see cref="Kind"/>,
/// <see cref="Class"/>, <see cref="Key"/>, <see cref="View"/>.
/// </para>
/// <para>
/// Per-kind:
/// </para>
/// <list type="bullet">
///   <item><c>kind="domain"</c>: Folder, Fields, FieldOrder.</item>
///   <item><c>kind="discriminatedFamily"</c>: Folder, Discriminator, Base, Variants.</item>
///   <item><c>kind="foldered"</c>: FolderDiscovery, Fields, FieldOrder.</item>
///   <item><c>kind="enumKeyed"</c>: Folder, EnumValues, FolderLayout, Fields, FieldOrder.</item>
/// </list>
/// </summary>
public sealed class Entry
{
    // Common -----------------------------------------------------------

    [JsonPropertyName("domain")]
    public string DomainName { get; set; } = "";

    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    [JsonPropertyName("class")]
    public string Class { get; set; } = "";

    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("displayName")]
    public string? DisplayName { get; set; }

    [JsonPropertyName("view")]
    public string View { get; set; } = "list";

    [JsonPropertyName("overrideUi")]
    public string? OverrideUi { get; set; }

    // Per-kind ---------------------------------------------------------

    [JsonPropertyName("folder")]
    public string? Folder { get; set; }

    [JsonPropertyName("fields")]
    public Dictionary<string, FieldDef>? Fields { get; set; }

    [JsonPropertyName("fieldOrder")]
    public List<string>? FieldOrder { get; set; }

    [JsonPropertyName("discriminator")]
    public string? Discriminator { get; set; }

    [JsonPropertyName("base")]
    public BaseDecl? Base { get; set; }

    [JsonPropertyName("variants")]
    public List<Variant>? Variants { get; set; }

    [JsonPropertyName("folderDiscovery")]
    public FolderDiscovery? FolderDiscovery { get; set; }

    [JsonPropertyName("enumValues")]
    public List<string>? EnumValues { get; set; }

    [JsonPropertyName("folderLayout")]
    public string? FolderLayout { get; set; }
}

/// <summary>The base portion of a discriminatedFamily entry.</summary>
public sealed class BaseDecl
{
    [JsonPropertyName("class")]
    public string Class { get; set; } = "";

    [JsonPropertyName("fields")]
    public Dictionary<string, FieldDef> Fields { get; set; } = new();

    [JsonPropertyName("fieldOrder")]
    public List<string> FieldOrder { get; set; } = new();
}

/// <summary>One variant of a discriminatedFamily entry.</summary>
public sealed class Variant
{
    [JsonPropertyName("value")]
    public string Value { get; set; } = "";

    [JsonPropertyName("class")]
    public string Class { get; set; } = "";

    [JsonPropertyName("extraFields")]
    public Dictionary<string, FieldDef> ExtraFields { get; set; } = new();

    [JsonPropertyName("extraFieldOrder")]
    public List<string> ExtraFieldOrder { get; set; } = new();
}

/// <summary>How a foldered entry's files are discovered.</summary>
public sealed class FolderDiscovery
{
    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "walk";

    /// <summary>"parentDir" or "grandparentDir".</summary>
    [JsonPropertyName("groupBy")]
    public string GroupBy { get; set; } = "parentDir";

    [JsonPropertyName("parentNameMustBe")]
    public string? ParentNameMustBe { get; set; }
}

/// <summary>One field declaration. Discriminated by <see cref="Type"/>;
/// per-type fields are non-null only for the matching type.</summary>
public sealed class FieldDef
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("required")]
    public bool? Required { get; set; }

    [JsonPropertyName("default")]
    public object? Default { get; set; }

    [JsonPropertyName("showWhen")]
    public Dictionary<string, object>? ShowWhen { get; set; }

    // Per-type extras --------------------------------------------------

    /// <summary>For <c>type="enum"</c>: declared inline values.</summary>
    [JsonPropertyName("values")]
    public List<string>? Values { get; set; }

    /// <summary>For <c>type="ref"</c>: target domain name.</summary>
    [JsonPropertyName("to")]
    public string? To { get; set; }

    /// <summary>For <c>type="array"</c> with sub-resource items, OR
    /// <c>type="subresource"</c>: the sub-resource name.</summary>
    [JsonPropertyName("of")]
    public string? Of { get; set; }

    /// <summary>For <c>type="array"</c> with ref items: target domain.</summary>
    [JsonPropertyName("itemRef")]
    public ItemRefDecl? ItemRef { get; set; }

    /// <summary>For <c>type="array"</c>: "typed" or "untyped".</summary>
    [JsonPropertyName("arrayContainerType")]
    public string? ArrayContainerType { get; set; }

    /// <summary>For <c>type="array"</c> or <c>type="subresource"</c>:
    /// field may be omitted entirely from .tres.</summary>
    [JsonPropertyName("nullable")]
    public bool? Nullable { get; set; }
}

/// <summary>For array fields whose items are cross-domain refs.</summary>
public sealed class ItemRefDecl
{
    [JsonPropertyName("to")]
    public string To { get; set; } = "";
}

/// <summary>One sub-resource declaration. Sub-resources are referenced
/// by <see cref="FieldDef.Of"/> on array or subresource fields.</summary>
public sealed class SubResource
{
    [JsonPropertyName("subResource")]
    public string SubResourceName { get; set; } = "";

    [JsonPropertyName("class")]
    public string Class { get; set; } = "";

    [JsonPropertyName("stableIdField")]
    public string StableIdField { get; set; } = "_subId";

    [JsonPropertyName("fields")]
    public Dictionary<string, FieldDef> Fields { get; set; } = new();

    [JsonPropertyName("fieldOrder")]
    public List<string> FieldOrder { get; set; } = new();
}

#endif
