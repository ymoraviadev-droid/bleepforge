// Foldered-kind registry for Snippet. Identity is composite
// <language>/<basename> where the language token is the parent
// directory's basename (groupBy=ParentDir).

#nullable enable

namespace BleepforgeTestProject;

using Bleepforge;
using Godot;

[Tool]
public partial class SnippetRegistry : BleepforgeFolderedRegistry<Snippet>
{
    public static SnippetRegistry Instance { get; private set; } = null!;

    protected override string GetFolder() => "res://data/snippets/";
    protected override FolderGroupMode GetGroupMode() => FolderGroupMode.ParentDir;

    public override void _EnterTree()
    {
        Instance = this;
        base._EnterTree();
    }
}
