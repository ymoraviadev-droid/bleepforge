// EnumKeyed-kind registry for ElementData. Exactly one ElementData per
// ElementKind enum value. Files live at data/elements/<value>/<value>.tres
// (subfolderPerValue layout).

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[Tool]
public partial class ElementRegistry : BleepforgeEnumRegistry<ElementKind, ElementData>
{
    public static ElementRegistry Instance { get; private set; } = null!;

    protected override string GetFolder() => "res://data/elements/";
    protected override ElementKind GetEnumKey(ElementData element) => element.ElementKind;

    public override void _EnterTree()
    {
        Instance = this;
        base._EnterTree();
    }
}
