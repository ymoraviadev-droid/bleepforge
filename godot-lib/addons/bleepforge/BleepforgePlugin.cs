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
/// <b>v0.2.6 Phase 3 status: manifest emitter wired.</b> On editor load
/// (or whenever the plugin re-enters the tree), the emitter reflects over
/// the user's <see cref="BleepforgeResource"/> subclasses + their
/// registries and writes <c>bleepforge_manifest.json</c> at the Godot
/// project root. A <c>Tools → Re-export Bleepforge manifest</c> menu
/// item provides the manual trigger.
/// </para>
///
/// <para>
/// The build-hook trigger (CI pre-build step that emits the manifest
/// without opening the editor) is deferred to a later release —
/// editor-load + manual menu cover the primary workflow.
/// </para>
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
    private const string ToolMenuLabel = "Re-export Bleepforge manifest";

    private Callable _emitCallable;

    public override void _EnterTree()
    {
        // Auto-export on editor load. If user assemblies aren't fully
        // loaded yet, the emitter logs warnings but produces a partial
        // manifest — re-trigger via the tool menu after fixing.
        EmitManifest();

        // Manual trigger for re-emit.
        _emitCallable = Callable.From(EmitManifest);
        AddToolMenuItem(ToolMenuLabel, _emitCallable);
    }

    public override void _ExitTree()
    {
        RemoveToolMenuItem(ToolMenuLabel);
    }

    private void EmitManifest()
    {
        var emitter = new ManifestEmitter();
        emitter.EmitToProjectRoot();
    }
}

#endif
