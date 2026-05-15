// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#nullable enable

namespace Bleepforge;

using Godot;

/// <summary>
/// Marker base class for any Resource that participates in the Bleepforge
/// manifest. Subclass this for every domain (Quest, ItemData, NpcData, etc.)
/// you want Bleepforge to author.
///
/// <para>
/// Concrete subclasses are discovered by the Phase 3 manifest emitter via
/// reflection — every <c>BleepforgeResource</c> subclass becomes a domain
/// entry in the emitted <c>bleepforge_manifest.json</c>. The runtime
/// registries (<see cref="BleepforgeRegistry{T}"/> and friends) load and
/// index <c>.tres</c> files of these types.
/// </para>
///
/// <para>
/// Add <c>[GlobalClass]</c> to your subclass so Godot's editor sees it as a
/// first-class resource type (visible in the "Create Resource" dialog,
/// referenceable from <c>[Export]</c> properties, etc.). Use auto-properties
/// with <c>[Export]</c> attributes for the authored fields. Use
/// <c>PropertyHint.MultilineText</c> for description / body / dialogue text.
/// </para>
///
/// <para>
/// Why a marker base instead of an attribute: subclassing makes the
/// "this resource is Bleepforge-authored" relationship explicit at the type
/// level (your IDE shows the inheritance, your domain class is unambiguously
/// in the system), and it leaves room for shared infrastructure to land on
/// the base in later releases (e.g. a virtual <c>Validate()</c> hook, change
/// notifications) without breaking existing user code.
/// </para>
/// </summary>
/// <example>
/// <code>
/// using Bleepforge;
/// using Godot;
///
/// [GlobalClass]
/// public partial class ItemData : BleepforgeResource
/// {
///     [Export] public string Slug { get; set; } = "";
///     [Export] public string DisplayName { get; set; } = "";
///     [Export(PropertyHint.MultilineText)] public string Description { get; set; } = "";
///     [Export] public bool IsStackable { get; set; } = true;
///     [Export] public int MaxStack { get; set; } = 99;
///     [Export] public int Price { get; set; } = 0;
/// }
/// </code>
/// </example>
public abstract partial class BleepforgeResource : Resource
{
}
