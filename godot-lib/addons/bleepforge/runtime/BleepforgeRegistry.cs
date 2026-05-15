// Copyright (c) 2026 Yehonatan Moravia
// Licensed under the Apache License, Version 2.0. See LICENSE in the
// godot-lib root for the full license text.

#nullable enable

namespace Bleepforge;

using System.Collections.Generic;
using Godot;

/// <summary>
/// Generic singleton registry for <see cref="BleepforgeResource"/> subclass
/// <typeparamref name="T"/>. Walks a configured folder of <c>.tres</c>
/// files at startup, indexes each by a user-provided key, and provides
/// O(1) lookup. Hot-reloads in the Godot editor when files change on
/// disk (opt-in via the <c>[Tool]</c> attribute on your concrete subclass).
///
/// <para>
/// Designed for the Bleepforge manifest's <c>"domain"</c> entry kind (one
/// resource per file, flat folder). For other kinds use the dedicated
/// subclasses:
/// </para>
/// <list type="bullet">
///   <item><see cref="BleepforgeFolderedRegistry{T}"/> — composite ids
///   <c>&lt;folder&gt;/&lt;basename&gt;</c> from the file's path.</item>
///   <item><see cref="BleepforgeDiscriminatedRegistry{TBase}"/> — base
///   class with N variants keyed by an enum on the base.</item>
///   <item><see cref="BleepforgeEnumRegistry{TEnum, T}"/> — exactly one
///   instance per enum value.</item>
/// </list>
///
/// <para>
/// Subclass with your concrete <typeparamref name="T"/> and override
/// <see cref="GetFolder"/> + <see cref="GetKey(T, string)"/>. Most users
/// also expose a static <c>Instance</c> property and add <c>[Tool]</c> to
/// participate in editor-time hot reload — see the example.
/// </para>
///
/// <para>
/// Read-only by design. If you need to track mutable state (active quests,
/// current karma values), compose a separate manager Node that holds a
/// reference to the registry. Mixing state into the registry was a pattern
/// in pre-library FoB and led to harder-to-reason-about lifecycles.
/// </para>
/// </summary>
/// <example>
/// <code>
/// using Bleepforge;
/// using Godot;
///
/// [Tool]
/// public partial class ItemRegistry : BleepforgeRegistry&lt;ItemData&gt;
/// {
///     public static ItemRegistry Instance { get; private set; } = null!;
///
///     protected override string GetFolder() => "res://world/collectibles/";
///     protected override string GetKey(ItemData item, string resPath) => item.Slug;
///
///     public override void _EnterTree()
///     {
///         Instance = this;
///         base._EnterTree();
///     }
/// }
/// </code>
/// Add <c>ItemRegistry</c> to your project's autoloads
/// (Project Settings → Autoload). Access at runtime as
/// <c>ItemRegistry.Instance.Get("rff_keycard")</c>.
/// </example>
[Tool]
public abstract partial class BleepforgeRegistry<T> : Node where T : BleepforgeResource
{
    private readonly Dictionary<string, T> _byKey = new();

    /// <summary>
    /// Emitted whenever the registry is rebuilt (initial build, in-editor
    /// hot reload, manual <see cref="Rebuild"/> call). Listeners can refresh.
    /// </summary>
    [Signal]
    public delegate void RegistryRebuiltEventHandler();

    /// <summary>
    /// <c>res://</c> path to the folder the registry walks for
    /// <c>.tres</c> files. Override in your concrete subclass.
    /// </summary>
    /// <returns>A path like <c>"res://world/collectibles/"</c>.</returns>
    protected abstract string GetFolder();

    /// <summary>
    /// Return the identity string for a loaded resource. Override in your
    /// concrete subclass — typically a one-liner returning a property like
    /// <c>resource.Slug</c> or <c>resource.Id</c>. The <paramref name="resPath"/>
    /// parameter is provided for foldered domains where identity is
    /// path-derived; most domains ignore it.
    /// </summary>
    /// <param name="resource">The loaded resource.</param>
    /// <param name="resPath">The <c>res://</c> path the resource was loaded from.</param>
    protected abstract string GetKey(T resource, string resPath);

    /// <summary>O(1) lookup by key. Returns <c>null</c> if not registered.</summary>
    public T? Get(string key) => _byKey.TryGetValue(key, out var v) ? v : null;

    /// <summary>True if the key is registered.</summary>
    public bool Has(string key) => _byKey.ContainsKey(key);

    /// <summary>Snapshot of all registered keys.</summary>
    public IReadOnlyCollection<string> Keys => _byKey.Keys;

    /// <summary>Snapshot of all registered resources.</summary>
    public IReadOnlyCollection<T> All => _byKey.Values;

    /// <summary>Number of registered resources.</summary>
    public int Count => _byKey.Count;

    public override void _EnterTree()
    {
        base._EnterTree();
        Rebuild();
        if (Engine.IsEditorHint())
        {
            ConnectFilesystemSignal();
        }
    }

    public override void _ExitTree()
    {
        if (Engine.IsEditorHint())
        {
            DisconnectFilesystemSignal();
        }
        base._ExitTree();
    }

    /// <summary>
    /// Walk the configured folder and rebuild the index from scratch.
    /// Called automatically on <see cref="_EnterTree"/> and on editor
    /// filesystem changes (when running with <c>[Tool]</c>); exposed
    /// publicly so user code can force a rebuild after a manual file
    /// change at runtime.
    /// </summary>
    public virtual void Rebuild()
    {
        _byKey.Clear();
        foreach (var resPath in WalkTresFiles(GetFolder()))
        {
            LoadAndRegister(resPath);
        }
        EmitSignal(SignalName.RegistryRebuilt);
    }

    /// <summary>
    /// Load a single <c>.tres</c> at the given <c>res://</c> path and add
    /// it to the index. Subclasses can override to add per-domain
    /// validation, defensive convention checks (see
    /// <see cref="BleepforgeFolderedRegistry{T}"/>), or subclass-specific
    /// loading.
    /// </summary>
    protected virtual void LoadAndRegister(string resPath)
    {
        var resource = ResourceLoader.Load<T>(resPath);
        if (resource == null)
        {
            GD.PushWarning($"[Bleepforge] {GetType().Name}: failed to load {resPath} as {typeof(T).Name}; skipping.");
            return;
        }
        var key = GetKey(resource, resPath);
        if (string.IsNullOrEmpty(key))
        {
            GD.PushWarning($"[Bleepforge] {GetType().Name}: {resPath} has empty key; skipping.");
            return;
        }
        if (_byKey.ContainsKey(key))
        {
            GD.PushWarning($"[Bleepforge] {GetType().Name}: duplicate key '{key}' (later one wins, from {resPath}).");
        }
        _byKey[key] = resource;
    }

    /// <summary>
    /// Walk a <c>res://</c> folder recursively, yielding <c>.tres</c>
    /// files. Skips dot-directories (<c>.godot</c>, <c>.import</c>, etc.).
    /// </summary>
    protected static IEnumerable<string> WalkTresFiles(string resFolder)
    {
        var stack = new Stack<string>();
        stack.Push(resFolder);
        while (stack.Count > 0)
        {
            var current = stack.Pop();
            using var dir = DirAccess.Open(current);
            if (dir == null) continue;
            dir.IncludeNavigational = false;
            dir.ListDirBegin();
            for (var name = dir.GetNext(); !string.IsNullOrEmpty(name); name = dir.GetNext())
            {
                if (name.StartsWith('.')) continue;
                var path = current.PathJoin(name);
                if (dir.CurrentIsDir())
                {
                    stack.Push(path);
                }
                else if (name.EndsWith(".tres"))
                {
                    yield return path;
                }
            }
            dir.ListDirEnd();
        }
    }

    private void ConnectFilesystemSignal()
    {
        var fs = EditorInterface.Singleton?.GetResourceFilesystem();
        if (fs == null) return;
        fs.FilesystemChanged += OnFilesystemChanged;
    }

    private void DisconnectFilesystemSignal()
    {
        var fs = EditorInterface.Singleton?.GetResourceFilesystem();
        if (fs == null) return;
        fs.FilesystemChanged -= OnFilesystemChanged;
    }

    private void OnFilesystemChanged() => Rebuild();
}
