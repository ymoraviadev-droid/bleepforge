// DiscriminatedFamily-kind registry for Equipment. The base type is
// Equipment; subclasses (Sword, Shield) are loaded as Equipment by
// Godot's ResourceLoader and pattern-matched at the call site (or via
// the typed GetAs<TVariant> helper on BleepforgeDiscriminatedRegistry).

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[Tool]
public partial class EquipmentRegistry : BleepforgeDiscriminatedRegistry<Equipment>
{
    public static EquipmentRegistry Instance { get; private set; } = null!;

    protected override string GetFolder() => "res://data/equipment/";
    protected override string GetKey(Equipment equipment, string resPath) => equipment.Slug;

    public override void _EnterTree()
    {
        Instance = this;
        base._EnterTree();
    }
}
