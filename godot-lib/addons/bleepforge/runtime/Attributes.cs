// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#nullable enable

namespace Bleepforge;

using System;

// Attribute classes consumed by the v0.2.6 Phase 3 manifest emitter.
//
// Most field types in the Bleepforge manifest are inferred from C# type +
// [Export] hints unambiguously. These attributes cover the few cases the
// type system can't express:
//
//   - flag vs plain string (both string-typed in C#)
//   - showWhen field-dependency predicates
//   - per-domain view + overrideUi declarations
//   - typed-array container shape (Godot.Collections.Array<T> vs T[])
//   - nullable inline sub-resource markers
//   - non-conventional domain names (override the class-name heuristic)
//
// All compile in release builds (no #if TOOLS) because users apply them
// to their authored resource fields, which ship in the runtime.

/// <summary>
/// Marks a string-typed field as a game-flag (auto-completes from the
/// corpus of flag values across all domains in the Bleepforge editor).
/// Without this, string fields default to the manifest's <c>"string"</c>
/// type. Use for fields like <c>SetsFlag</c>, <c>OffendedFlag</c>,
/// <c>ContextualFlag</c>.
/// </summary>
/// <example>
/// <code>
/// [Export, BleepforgeFlag] public string SetsFlag { get; set; } = "";
/// </code>
/// </example>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field, AllowMultiple = false)]
public sealed class BleepforgeFlagAttribute : Attribute
{
}

/// <summary>
/// Field-dependency predicate. The decorated field is "applicable" only
/// when the named sibling field's current value matches one of the given
/// values. Gates BOTH the editor's UI rendering (form hides the field)
/// AND writeback (mapper omits the field from .tres output). Same
/// primitive, dual-purpose.
///
/// <para>
/// Use for discriminated-union-style fields where one enum field
/// determines which other fields are meaningful. The canonical example
/// is Quest Objective: <c>Type=CollectItem</c> uses <c>TargetItem</c>;
/// <c>Type=TalkToNpc</c> uses <c>TargetId</c>; etc.
/// </para>
/// </summary>
/// <example>
/// <code>
/// [Export] public ObjectiveType Type { get; set; }
///
/// [Export, BleepforgeShowWhen("Type", "CollectItem")]
/// public ItemData? TargetItem { get; set; }
///
/// [Export, BleepforgeShowWhen("Type", "TalkToNpc", "KillNpc")]
/// public string TargetId { get; set; } = "";
/// </code>
/// </example>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field, AllowMultiple = false)]
public sealed class BleepforgeShowWhenAttribute : Attribute
{
    public string OtherField { get; }
    public object[] Values { get; }

    public BleepforgeShowWhenAttribute(string otherField, params object[] values)
    {
        OtherField = otherField;
        Values = values;
    }
}

/// <summary>
/// Marks a single-inline-subresource OR array field as nullable (may be
/// absent entirely from the .tres on save). Without this, the editor
/// emits an empty <c>[]</c> for arrays or insists on a value for
/// sub-resources.
///
/// <para>
/// The canonical example is <c>NpcData.LootTable</c> — an NPC may have
/// no loot at all, in which case the LootTable wrapper is omitted.
/// </para>
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field, AllowMultiple = false)]
public sealed class BleepforgeNullableAttribute : Attribute
{
}

/// <summary>
/// Marks an array field as using Godot's typed-collection literal:
/// <c>Array[ExtResource("scriptId")]([...])</c> instead of plain
/// <c>[...]</c>. Required for any field declared in C# as
/// <c>Godot.Collections.Array&lt;T&gt;</c> (vs. plain <c>T[]</c>).
/// Getting this wrong silently breaks the consumer side.
/// </summary>
/// <example>
/// <code>
/// [Export, BleepforgeArrayContainer(ArrayContainerKind.Typed)]
/// public Godot.Collections.Array&lt;LootEntry&gt; Entries { get; set; } = new();
/// </code>
/// </example>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field, AllowMultiple = false)]
public sealed class BleepforgeArrayContainerAttribute : Attribute
{
    public ArrayContainerKind Kind { get; }

    public BleepforgeArrayContainerAttribute(ArrayContainerKind kind)
    {
        Kind = kind;
    }
}

/// <summary>
/// Which array container literal the manifest emitter declares for an
/// array field. Default <see cref="Untyped"/>.
/// </summary>
public enum ArrayContainerKind
{
    /// <summary>Plain Godot array literal: <c>[item, item, ...]</c>.</summary>
    Untyped,

    /// <summary>Typed array literal: <c>Array[ExtResource("scriptId")]([...])</c>.
    /// Required for C# <c>Godot.Collections.Array&lt;T&gt;</c> fields.</summary>
    Typed,
}

/// <summary>
/// Sets the editor's default surface for this domain. Applied to a
/// <see cref="BleepforgeResource"/> subclass. Defaults to <c>"list"</c>
/// when not specified. <c>"graph"</c> requires the resource to have at
/// least one ref-typed field (otherwise there are no edges to draw).
/// </summary>
/// <example>
/// <code>
/// [GlobalClass, BleepforgeView(ViewKind.Graph)]
/// public partial class DialogSequence : BleepforgeResource { ... }
/// </code>
/// </example>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class BleepforgeViewAttribute : Attribute
{
    public ViewKind Kind { get; }

    public BleepforgeViewAttribute(ViewKind kind)
    {
        Kind = kind;
    }
}

/// <summary>The default editor surface for a Bleepforge domain.</summary>
public enum ViewKind
{
    /// <summary>Compact one-row-per-entity list. The default.</summary>
    List,

    /// <summary>Visual-rich card grid. Use when entities have
    /// thumbnails / icons worth surfacing at a glance.</summary>
    Cards,

    /// <summary>Graph view connecting entities by their ref fields. Use
    /// for dialogs, quest-flow, or any "next-style" reference network.</summary>
    Graph,
}

/// <summary>
/// Names a registered React component the Bleepforge editor should mount
/// instead of the generic surface for this domain. Applied to a
/// <see cref="BleepforgeResource"/> subclass. Editor checks for the
/// component before falling back to the generic.
///
/// <para>
/// Used when a domain has bespoke editing affordances the generic
/// surface doesn't cover (e.g. dialog graph drag-to-edit, NPC loot
/// table picker, balloon speech-bubble preview). The component must be
/// registered in the editor's component registry by Phase 4+.
/// </para>
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class BleepforgeOverrideUiAttribute : Attribute
{
    public string ComponentName { get; }

    public BleepforgeOverrideUiAttribute(string componentName)
    {
        ComponentName = componentName;
    }
}

/// <summary>
/// Override the manifest's domain name for a registry. Applied to a
/// <c>BleepforgeRegistry&lt;T&gt;</c> subclass (or any of the four
/// kind-specific registry subclasses). Default behavior is to derive
/// the domain name from the registry class name by stripping common
/// suffixes (<c>Registry</c>, <c>Database</c>, <c>Manager</c>) and
/// lowercasing — <c>ItemRegistry</c> becomes <c>"item"</c>. Use this
/// attribute when the heuristic doesn't fit your naming.
/// </summary>
/// <example>
/// <code>
/// [Tool, BleepforgeDomain("hazard")]
/// public partial class WorldHazardRegistry : BleepforgeRegistry&lt;HazardData&gt;
/// {
///     // ...
/// }
/// </code>
/// </example>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class BleepforgeDomainAttribute : Attribute
{
    public string Name { get; }

    public BleepforgeDomainAttribute(string name)
    {
        Name = name;
    }
}
