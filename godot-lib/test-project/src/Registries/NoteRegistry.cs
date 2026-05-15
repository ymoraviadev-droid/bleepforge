// Domain-kind registry for Note. Identity comes from Note.Slug.

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[Tool]
public partial class NoteRegistry : BleepforgeRegistry<Note>
{
    public static NoteRegistry Instance { get; private set; } = null!;

    protected override string GetFolder() => "res://data/notes/";
    protected override string GetKey(Note note, string resPath) => note.Slug;

    public override void _EnterTree()
    {
        Instance = this;
        base._EnterTree();
    }
}
