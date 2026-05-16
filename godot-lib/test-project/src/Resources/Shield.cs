// Equipment variant for Type=Shield. Adds Defense.

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[GlobalClass, BleepforgeVariantValue("Shield")]
public partial class Shield : Equipment
{
    [Export] public int Defense { get; set; } = 0;
}
