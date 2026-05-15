// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#nullable enable

namespace Bleepforge;

using Godot;

/// <summary>
/// Registry for the manifest's <c>"discriminatedFamily"</c> entry kind. A
/// base class with N variants keyed by an enum field on the base. Use this
/// for domains like Item where <c>ItemData</c> has subclasses
/// (<c>QuestItemData</c>, etc.) and a <c>Category</c> enum on the base
/// picks which variant a given file represents.
///
/// <para>
/// At the runtime level, this is mostly a thin wrapper around
/// <see cref="BleepforgeRegistry{T}"/> with <typeparamref name="TBase"/> as
/// the type parameter — Godot's <see cref="ResourceLoader"/> already
/// instantiates the correct subclass when loading a <c>.tres</c> whose
/// <c>script_class</c> points at the variant. The registry stashes
/// everything as <typeparamref name="TBase"/>; users pattern-match or
/// use <see cref="GetAs{TVariant}"/> to retrieve a typed variant.
/// </para>
///
/// <para>
/// The "discriminated" distinction matters more for Phase 3+ (the manifest
/// emitter) than for runtime — the emitter walks variants and emits
/// per-variant field declarations. This dedicated subclass exists for
/// symmetry with the manifest's four kinds and for future extension
/// (e.g. variant-aware validation hooks).
/// </para>
/// </summary>
/// <example>
/// <code>
/// using Bleepforge;
/// using Godot;
///
/// [Tool]
/// public partial class ItemRegistry : BleepforgeDiscriminatedRegistry&lt;ItemData&gt;
/// {
///     public static ItemRegistry Instance { get; private set; } = null!;
///
///     protected override string GetFolder() => "res://world/collectibles/";
///     protected override string GetKey(ItemData item, string resPath) => item.Slug;
///
///     public override void _EnterTree()
///     {
///         Instance = this;
///         base._EnterTree();
///     }
/// }
///
/// // Usage:
/// var item = ItemRegistry.Instance.Get("rff_keycard");
/// if (item is QuestItemData questItem)
/// {
///     GD.Print($"Quest: {questItem.QuestId}");
/// }
///
/// // Or with the typed accessor:
/// var keycard = ItemRegistry.Instance.GetAs&lt;QuestItemData&gt;("rff_keycard");
/// </code>
/// </example>
[Tool]
public abstract partial class BleepforgeDiscriminatedRegistry<TBase> : BleepforgeRegistry<TBase>
    where TBase : BleepforgeResource
{
    /// <summary>
    /// Lookup by key, returning the resource cast to the requested variant
    /// type. Returns <c>null</c> if the key isn't registered OR if the
    /// stored resource isn't actually a <typeparamref name="TVariant"/>.
    /// Use this when you know which variant you expect — saves the
    /// pattern-match boilerplate at the call site.
    /// </summary>
    public TVariant? GetAs<TVariant>(string key) where TVariant : class, TBase
    {
        return Get(key) as TVariant;
    }
}
