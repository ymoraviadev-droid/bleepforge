// Sample domain-kind resource. Flat folder of notes, identity = Slug.

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[GlobalClass]
public partial class Note : BleepforgeResource
{
    [Export] public string Slug { get; set; } = "";
    [Export] public string Title { get; set; } = "";
    [Export(PropertyHint.MultilineText)] public string Body { get; set; } = "";
    [Export] public string CreatedAt { get; set; } = "";
}
