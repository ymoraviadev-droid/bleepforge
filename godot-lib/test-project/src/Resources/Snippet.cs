// Sample foldered-kind resource. Identity = composite <folder>/<basename>
// where the folder is the parent dir basename (the language token).
//
// On disk: data/snippets/cs/whatever.tres → id "cs/whatever".

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[GlobalClass]
public partial class Snippet : BleepforgeResource
{
    [Export(PropertyHint.MultilineText)] public string Body { get; set; } = "";
    [Export] public string Language { get; set; } = "";
}
