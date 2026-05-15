// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#if TOOLS
#nullable enable

namespace Bleepforge.Editor;

using Godot;

/// <summary>
/// Bleepforge editor plugin entry point. Loaded by Godot when the plugin
/// is enabled in Project Settings → Plugins.
///
/// <para>
/// <b>v0.2.6 Phase 2 status: scaffold only.</b> This file replaces the
/// Phase 1 GDScript stub and is the C# entry point the rest of the library
/// will hang off in subsequent phases. The runtime registries
/// (<see cref="BleepforgeRegistry{T}"/> and friends) work without this
/// plugin — users add them to their scene tree as autoloads. The plugin
/// is for editor-time concerns only.
/// </para>
///
/// <para>
/// Phase 3 (manifest emitter) will register here:
/// </para>
/// <list type="bullet">
///   <item>Reflection over <see cref="BleepforgeResource"/> subclasses to
///   build the manifest.</item>
///   <item>Editor-load auto-export of <c>bleepforge_manifest.json</c> at
///   the project root.</item>
///   <item>"Re-export Bleepforge manifest" tool menu item (manual trigger
///   override).</item>
///   <item>Build hook (CI pre-build step writes the manifest so a fresh
///   checkout has it without opening the editor).</item>
/// </list>
///
/// <para>
/// The whole class is wrapped in <c>#if TOOLS</c> because <see cref="EditorPlugin"/>
/// only exists in editor builds. Without the guard, exporting a release
/// build of the user's project would fail to compile.
/// </para>
/// </summary>
[Tool]
public partial class BleepforgePlugin : EditorPlugin
{
    public override void _EnterTree()
    {
        // Phase 3 will:
        //   - Instantiate the manifest emitter.
        //   - Hook editor-load via EditorInterface.Singleton's filesystem
        //     signals OR a one-shot post-load timer.
        //   - Add a "Re-export Bleepforge manifest" item to the Tools menu
        //     via AddToolMenuItem.
    }

    public override void _ExitTree()
    {
        // Phase 3 will:
        //   - Unhook every signal connected in _EnterTree.
        //   - Remove the tool menu item via RemoveToolMenuItem.
    }
}

#endif
