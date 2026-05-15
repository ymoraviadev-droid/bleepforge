// Equipment variant for Type=Shield. Adds Defense.

#nullable enable

namespace BleepforgeTestProject;

using Godot;

[GlobalClass]
public partial class Shield : Equipment
{
    public Shield()
    {
        // See Sword.cs for why this constructor exists.
        Type = EquipmentType.Shield;
    }

    [Export] public int Defense { get; set; } = 0;
}
