// Equipment variant for Type=Sword. Adds Damage.

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[GlobalClass, BleepforgeVariantValue("Sword")]
public partial class Sword : Equipment
{
    [Export] public int Damage { get; set; } = 0;
}
