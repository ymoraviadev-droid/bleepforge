// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#nullable enable

namespace Bleepforge;

using System;
using System.Collections.Generic;
using Godot;

/// <summary>
/// Registry for the manifest's <c>"enumKeyed"</c> entry kind. Exactly one
/// instance of <typeparamref name="T"/> per <typeparamref name="TEnum"/>
/// value. Used for domains like Faction where the set of valid keys is a
/// closed enum (Scavengers / FreeRobots / RFF / Grove) and each value
/// owns one resource file.
///
/// <para>
/// Identity comes from the resource's <typeparamref name="TEnum"/>-typed
/// key field, exposed via <see cref="GetEnumKey"/>. The base class handles
/// converting that to/from the string form used by the underlying
/// <see cref="BleepforgeRegistry{T}"/> index. <see cref="GetByEnum"/>
/// gives you the typed lookup.
/// </para>
///
/// <para>
/// On boot the registry warns if any <typeparamref name="TEnum"/> value is
/// missing a corresponding resource — a Faction enum value with no matching
/// FactionData on disk is almost certainly a bug.
/// </para>
/// </summary>
/// <example>
/// <code>
/// using Bleepforge;
/// using Godot;
///
/// public enum Faction { Scavengers, FreeRobots, RFF, Grove }
///
/// [GlobalClass]
/// public partial class FactionData : BleepforgeResource
/// {
///     [Export] public Faction Faction { get; set; }
///     [Export] public string DisplayName { get; set; } = "";
///     // ...
/// }
///
/// [Tool]
/// public partial class FactionRegistry : BleepforgeEnumRegistry&lt;Faction, FactionData&gt;
/// {
///     public static FactionRegistry Instance { get; private set; } = null!;
///
///     protected override string GetFolder() => "res://shared/components/factions/";
///     protected override Faction GetEnumKey(FactionData faction) => faction.Faction;
///
///     public override void _EnterTree()
///     {
///         Instance = this;
///         base._EnterTree();
///     }
/// }
///
/// // Usage: FactionRegistry.Instance.GetByEnum(Faction.Scavengers)
/// </code>
/// </example>
[Tool]
public abstract partial class BleepforgeEnumRegistry<TEnum, T> : BleepforgeRegistry<T>
    where TEnum : struct, Enum
    where T : BleepforgeResource
{
    /// <summary>
    /// Return the enum value identifying a loaded resource. Override in
    /// your concrete subclass.
    /// </summary>
    protected abstract TEnum GetEnumKey(T resource);

    /// <summary>O(1) typed lookup by enum value.</summary>
    public T? GetByEnum(TEnum value) => Get(value.ToString());

    /// <summary>True if the enum value has a registered resource.</summary>
    public bool HasEnum(TEnum value) => Has(value.ToString());

    /// <inheritdoc />
    protected sealed override string GetKey(T resource, string resPath)
    {
        return GetEnumKey(resource).ToString();
    }

    /// <inheritdoc />
    public override void Rebuild()
    {
        base.Rebuild();
        WarnOnMissingEnumValues();
    }

    private void WarnOnMissingEnumValues()
    {
        var missing = new List<string>();
        foreach (TEnum value in Enum.GetValues<TEnum>())
        {
            if (!HasEnum(value))
            {
                missing.Add(value.ToString());
            }
        }
        if (missing.Count > 0)
        {
            GD.PushWarning(
                $"[Bleepforge] {GetType().Name}: no resource for enum value(s): {string.Join(", ", missing)}. " +
                $"Each {typeof(TEnum).Name} value should have a matching {typeof(T).Name} .tres in {GetFolder()}.");
        }
    }
}
