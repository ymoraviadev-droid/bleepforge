// Sample enumKeyed-kind resource. Identity = the ElementKind enum value.
// Exactly one ElementData per enum value (Fire, Water, Earth, Air).

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[GlobalClass]
public partial class ElementData : BleepforgeResource
{
    [Export] public ElementKind ElementKind { get; set; }
    [Export] public string DisplayName { get; set; } = "";
    [Export] public string Color { get; set; } = "";
    [Export] public int Strength { get; set; } = 0;
}
