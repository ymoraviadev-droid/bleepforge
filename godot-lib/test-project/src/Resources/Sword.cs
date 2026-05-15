// Equipment variant for Type=Sword. Adds Damage.

#nullable enable

namespace BleepforgeTestProject;

using Godot;

[GlobalClass]
public partial class Sword : Equipment
{
    public Sword()
    {
        // Set the discriminator's default per-variant. Without this, the
        // manifest emitter (which instantiates each variant via Activator
        // and reads property defaults) would see EquipmentType.Sword (the
        // enum's first value) for BOTH Sword AND Shield — both would get
        // misclassified as "Sword" in the variants[] list.
        //
        // v0.2.7 candidate: a [BleepforgeVariantValue("Sword")] attribute
        // on the class would replace this constructor workaround.
        Type = EquipmentType.Sword;
    }

    [Export] public int Damage { get; set; } = 0;
}
