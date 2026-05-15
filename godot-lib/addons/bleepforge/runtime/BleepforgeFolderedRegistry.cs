// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#nullable enable

namespace Bleepforge;

using System.IO;
using Godot;

/// <summary>
/// Registry for the manifest's <c>"foldered"</c> entry kind. Resources are
/// grouped by their containing folder, and the identity is the composite
/// <c>&lt;folder&gt;/&lt;basename&gt;</c>. Used for domains where the same
/// content type lives in multiple sibling folders (one per speaker, one
/// per NPC model, etc.) and the folder name is part of the resource's
/// meaning.
///
/// <para>
/// Override <see cref="GetGroupMode"/> to pick which directory level
/// supplies the folder portion of the id:
/// </para>
/// <list type="bullet">
///   <item><see cref="FolderGroupMode.ParentDir"/> — the immediate
///   parent dir basename. Example: a Dialog at
///   <c>res://characters/npcs/hap_500/dialogs/Eddie/welcome_001.tres</c>
///   gets the id <c>Eddie/welcome_001</c>.</item>
///   <item><see cref="FolderGroupMode.GrandparentDir"/> — the dir two
///   levels up. Example: a Balloon at
///   <c>res://characters/npcs/hap_500/balloons/greeting.tres</c> gets the
///   id <c>hap_500/greeting</c> (grandparent = <c>hap_500</c>).</item>
/// </list>
///
/// <para>
/// Override <see cref="GetParentNameMustBe"/> to add a defensive
/// convention check — when set, only files whose immediate parent dir
/// matches the given name are picked up. Use this to guard against stray
/// files of the same type living elsewhere in the project (e.g. for
/// Balloon, set this to <c>"balloons"</c> so a Balloon <c>.tres</c>
/// accidentally placed under <c>art/</c> isn't misclassified).
/// </para>
///
/// <para>
/// Identity comes from path layout, not from a property on the resource —
/// <see cref="BleepforgeRegistry{T}.GetKey"/> is sealed on this class.
/// Your concrete subclass overrides <see cref="BleepforgeRegistry{T}.GetFolder"/>,
/// <see cref="GetGroupMode"/>, and (optionally)
/// <see cref="GetParentNameMustBe"/> — that's it.
/// </para>
/// </summary>
/// <example>
/// <code>
/// using Bleepforge;
/// using Godot;
///
/// [Tool]
/// public partial class BalloonRegistry : BleepforgeFolderedRegistry&lt;BalloonLine&gt;
/// {
///     public static BalloonRegistry Instance { get; private set; } = null!;
///
///     protected override string GetFolder() => "res://characters/npcs/";
///     protected override FolderGroupMode GetGroupMode() => FolderGroupMode.GrandparentDir;
///     protected override string? GetParentNameMustBe() => "balloons";
///
///     public override void _EnterTree()
///     {
///         Instance = this;
///         base._EnterTree();
///     }
/// }
///
/// // Usage: BalloonRegistry.Instance.Get("hap_500/greeting")
/// </code>
/// </example>
[Tool]
public abstract partial class BleepforgeFolderedRegistry<T> : BleepforgeRegistry<T>
    where T : BleepforgeResource
{
    /// <summary>
    /// Which directory level supplies the folder portion of the composite
    /// id. Override in your concrete subclass.
    /// </summary>
    protected abstract FolderGroupMode GetGroupMode();

    /// <summary>
    /// Defensive parent-dir-name check. When non-null, only files whose
    /// immediate parent directory's basename equals this string are picked
    /// up. Returns <c>null</c> by default (no check). Override in your
    /// concrete subclass to enforce a convention.
    /// </summary>
    protected virtual string? GetParentNameMustBe() => null;

    /// <inheritdoc />
    protected sealed override string GetKey(T resource, string resPath)
    {
        var basename = Path.GetFileNameWithoutExtension(resPath);
        var folderToken = ExtractFolderToken(resPath, GetGroupMode());
        return $"{folderToken}/{basename}";
    }

    /// <inheritdoc />
    protected override void LoadAndRegister(string resPath)
    {
        var requiredParent = GetParentNameMustBe();
        if (requiredParent != null)
        {
            var immediateParent = ImmediateParentBasename(resPath);
            if (immediateParent != requiredParent)
            {
                // Convention violation — skip silently. The user's intent
                // was likely "this file isn't really one of mine"; warning
                // every time would be noise.
                return;
            }
        }
        base.LoadAndRegister(resPath);
    }

    private static string ExtractFolderToken(string resPath, FolderGroupMode mode)
    {
        // resPath looks like "res://path/to/folder/file.tres". Strip the
        // file, then walk up the configured number of dir levels.
        var dir = Path.GetDirectoryName(resPath) ?? "";
        return mode switch
        {
            FolderGroupMode.ParentDir => Path.GetFileName(dir),
            FolderGroupMode.GrandparentDir => Path.GetFileName(Path.GetDirectoryName(dir) ?? ""),
            _ => "",
        };
    }

    private static string ImmediateParentBasename(string resPath)
    {
        var dir = Path.GetDirectoryName(resPath) ?? "";
        return Path.GetFileName(dir);
    }
}

/// <summary>
/// Which directory level supplies the folder portion of a foldered
/// registry's composite id.
/// </summary>
public enum FolderGroupMode
{
    /// <summary>The immediate parent directory's basename.</summary>
    ParentDir,

    /// <summary>The directory two levels up from the file.</summary>
    GrandparentDir,
}
