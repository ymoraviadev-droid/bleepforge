// Sample discriminatedFamily-kind base. Subclassed by Sword + Shield, each
// of which adds variant-specific fields. Identity = Slug. The Type enum
// field is the discriminator the manifest emitter picks up to map base
// values to variant entries.

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[GlobalClass]
public partial class Equipment : BleepforgeResource
{
    [Export] public string Slug { get; set; } = "";
    [Export] public string Name { get; set; } = "";
    [Export] public EquipmentType Type { get; set; }
    [Export] public float Weight { get; set; } = 0.0f;
}
