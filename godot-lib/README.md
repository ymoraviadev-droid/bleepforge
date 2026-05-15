# godot-lib — the Godot side of Bleepforge

A small companion library you drop into your Godot 4 / C# project to make it Bleepforge-compatible.

**Status: v0.2.6 Phase 2 — runtime registries shipped, manifest emitter pending.** The base classes work today; you can subclass and run them in your Godot project. The editor-time hot reload + manifest emit (the parts that connect to the Bleepforge editor) land in Phase 3.

- **Phase 1** ✓ — folder structure, `plugin.cfg`, placeholder GDScript stub, Apache 2.0 LICENSE.
- **Phase 2** ✓ — C# library tier 1: `BleepforgeResource` (marker base class), `BleepforgeRegistry<T>`, `BleepforgeFolderedRegistry<T>`, `BleepforgeDiscriminatedRegistry<TBase>`, `BleepforgeEnumRegistry<TEnum, T>`. All registries walk paths, index by key, opt into editor-time hot reload via `[Tool]` + Godot's `EditorFileSystem` filesystem-changed signal. The Phase 1 GDScript stub is replaced by `BleepforgePlugin.cs` (a `[Tool]` `EditorPlugin`) that Phase 3 hangs the manifest emitter off.
- **Phase 3** — Manifest emitter. Library reflects over `BleepforgeResource` subclasses, builds the manifest, writes `bleepforge_manifest.json` at the Godot project root. Three triggers: editor-load auto-export (default), manual menu button, build hook.
- **Phase 4** — Editor-side manifest consumption (lands in the Bleepforge editor, not here).
- **Phase 5** — Validation harness. Tiny synthetic Godot project at `godot-lib/test-project/` with 2-3 resource types covering different kinds (`domain` + `foldered` minimum). Library exports manifest, editor reads it, registry hot reload works. NOT FoB.
- **Phase 6** — Docs + release. AssetLib publish via release artifact pointing at the `addons/bleepforge/` subfolder.

## What works today (Phase 2)

- **5 registry base classes** that handle the "walk a folder of `.tres`, index by key, expose O(1) lookup" pattern. Subclass with your concrete resource type, override 2-4 hooks, register as a Godot autoload, you're done. Replaces the per-domain autoload singletons that game projects (FoB included) typically write by hand.
- **Editor-time hot reload** opt-in via `[Tool]` on your subclass. The base class connects to `EditorInterface.Singleton.GetResourceFilesystem().FilesystemChanged`; when Bleepforge writes a `.tres` and the editor's watcher fires, the registry rebuilds + emits a `RegistryRebuilt` signal listeners can refresh on. At runtime (game running) there's no automatic reload — call `Rebuild()` manually if you need it. Polling-based runtime reload is a future concern.
- **`BleepforgePlugin.cs`** — the C# `EditorPlugin` entry point Godot loads when you enable the plugin. Phase 2 ships it as a no-op scaffold; Phase 3 hangs the manifest emitter off it.

## What's coming (Phase 3+)

- **Emit the Bleepforge manifest** — a JSON file at the project root that describes every `BleepforgeResource` subclass: which kind of entry it is (`domain` / `discriminatedFamily` / `foldered` / `enumKeyed`), what fields it has, the editor surface it wants (`list` / `cards` / `graph`), any bespoke override UI to mount instead of the generic. The Bleepforge editor reads this manifest and drives every authoring surface from it.

## Installation (post-Phase 3, when the manifest emitter lands)

1. Copy the `addons/bleepforge/` folder into your Godot project's `addons/` directory.
2. Open your project in the Godot editor.
3. Project → Project Settings → Plugins → enable **Bleepforge**.
4. The library writes `bleepforge_manifest.json` at your project root on the next editor load.
5. Point Bleepforge at your Godot project (sync mode) — the manifest drives the editor surfaces.

Today (Phase 2) you can already use the registry base classes by themselves — see the XML-doc examples on each class. The plugin itself is still a scaffold.

## The five base classes

| Class | Manifest kind | Identity |
| --- | --- | --- |
| `BleepforgeResource` | (marker base for all of them) | — |
| `BleepforgeRegistry<T>` | `domain` | Field on the resource (e.g. `Slug`, `Id`) |
| `BleepforgeFolderedRegistry<T>` | `foldered` | Composite `<folder>/<basename>` from the file's path |
| `BleepforgeDiscriminatedRegistry<TBase>` | `discriminatedFamily` | Field on the base (variant subclass loaded by Godot's ResourceLoader) |
| `BleepforgeEnumRegistry<TEnum, T>` | `enumKeyed` | Enum-typed field on the resource |

Each base class has a worked example in its XML-doc summary covering the typical subclass shape (override `GetFolder`, override `GetKey` or its variants, expose static `Instance` in `_EnterTree`, add `[Tool]` to opt into editor hot reload).

## Compatibility

- **Godot 4.4+** (uses `EditorInterface.Singleton` + `DirAccess.IncludeNavigational`, both stabilized by 4.4). Tested against Godot 4.6 (the version FoB targets).
- **.NET 8.0+** for the user's project. Set `<TargetFramework>net8.0</TargetFramework>` in your `.csproj` (Godot 4.6's default).
- **C#** only. No GDScript variants of the base classes — the manifest emit (Phase 3) needs reflection over compiled types.
- **Cross-platform** by construction — no platform-specific code, just `Godot` + `System.IO` APIs.

## Layout

```text
godot-lib/
├── addons/bleepforge/                       The Godot plugin
│   │                                        (drops into <user-project>/addons/)
│   ├── plugin.cfg                           Godot plugin manifest
│   ├── BleepforgePlugin.cs                  [Tool] EditorPlugin entry point
│   └── runtime/                             User-extensible base classes
│       ├── BleepforgeResource.cs            Marker base for authored Resources
│       ├── BleepforgeRegistry.cs            Generic flat registry
│       ├── BleepforgeFolderedRegistry.cs    Composite-id grouping
│       ├── BleepforgeDiscriminatedRegistry.cs   Variant routing
│       └── BleepforgeEnumRegistry.cs        One-per-enum-value
├── test-project/                            Synthetic validation project
│                                            (lands in Phase 5)
├── LICENSE                                  Apache 2.0
└── README.md                                this file
```

## Why a separate folder, not a separate repo

The library, the manifest spec, and the Bleepforge editor evolve together. Atomic commits across all three keep the contract honest — a manifest schema change in [shared/src/manifest.ts](../shared/src/manifest.ts), the corresponding emitter change here, and any editor consumption change land in the same commit. Splitting the repos would mean every contract change requires coordinated PRs against two repos.

When the library is ready for AssetLib distribution (post-Phase 6), AssetLib supports publishing from a subfolder — the release artifact points at `godot-lib/addons/bleepforge/` and users get the contents as if it were standalone.

## License

**Apache License 2.0.** See [LICENSE](LICENSE).

Apache 2.0 is the standard "permissive but not naive" choice — broad rights to use, modify, and redistribute, plus an explicit patent grant and an explicit "no trademark license is granted" clause. Pragmatic for a Godot library you want widely adopted: drop it into your project without thinking, but you can't claim "Bleepforge" as your own.

The rest of the Bleepforge monorepo (the editor — `client/`, `server/`, `shared/`, `electron/`) is licensed under **GNU Affero General Public License v3 or later** — copyleft, forks must remain open. See the root [LICENSE](../LICENSE) and [TRADEMARK.md](../TRADEMARK.md) for the editor's terms and the trademark policy that protects the Bleepforge name + logo.

Copyright © 2026 Yehonatan Moravia.

## See also

- [../CLAUDE.md](../CLAUDE.md) — the project bible. Search for "Genericization arc" for the full v0.2.6 → v0.3.0 plan.
- [../shared/src/manifest.ts](../shared/src/manifest.ts) — the locked manifest schema (the contract this library must emit).
- [../README.md](../README.md) — Bleepforge's public-facing intro.
