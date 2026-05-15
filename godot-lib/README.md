# godot-lib — the Godot side of Bleepforge

A small companion library you drop into your Godot 4 / C# project to make it Bleepforge-compatible.

**Status: v0.2.6 Phase 3 — manifest emitter shipped.** The library now produces a manifest. A user with `BleepforgeResource` subclasses + matching registries enables the plugin and gets `bleepforge_manifest.json` at their project root on editor load. The editor-side consumer (Phase 4) hasn't shipped yet, so the manifest doesn't yet drive the Bleepforge editor.

- **Phase 1** ✓ — folder structure, `plugin.cfg`, placeholder GDScript stub, Apache 2.0 LICENSE.
- **Phase 2** ✓ — C# library tier 1: `BleepforgeResource` + 4 registry base classes. Walk paths, index by key, opt-in editor hot reload.
- **Phase 3** ✓ — Manifest emitter. `ManifestEmitter` reflects over registry subclasses + their resource types, builds a `Manifest` POCO matching the zod schema in [shared/src/manifest.ts](../shared/src/manifest.ts), writes `bleepforge_manifest.json` at the Godot project root. Triggered automatically on plugin enter-tree (editor load) and via a `Tools → Re-export Bleepforge manifest` menu item. Build hook (CI) deferred to a later release.
- **Phase 4** — Editor-side manifest consumption (lands in the Bleepforge editor, not here).
- **Phase 5** — Validation harness. Tiny synthetic Godot project at `godot-lib/test-project/` with 2-3 resource types covering different kinds (`domain` + `foldered` minimum). Library exports manifest, editor reads it, registry hot reload works. NOT FoB.
- **Phase 6** — Docs + release. AssetLib publish via release artifact pointing at the `addons/bleepforge/` subfolder.

## What works today (Phase 2 + 3)

- **5 registry base classes** that handle the "walk a folder of `.tres`, index by key, expose O(1) lookup" pattern. Subclass with your concrete resource type, override 2-4 hooks, register as a Godot autoload, you're done. Replaces the per-domain autoload singletons that game projects (FoB included) typically write by hand.
- **Editor-time hot reload** opt-in via `[Tool]` on your subclass. The base class connects to `EditorInterface.Singleton.GetResourceFilesystem().FilesystemChanged`; when Bleepforge writes a `.tres` and the editor's watcher fires, the registry rebuilds + emits a `RegistryRebuilt` signal listeners can refresh on. At runtime (game running) there's no automatic reload — call `Rebuild()` manually if you need it. Polling-based runtime reload is a future concern.
- **Manifest emitter** (Phase 3). On plugin enable / editor load, `ManifestEmitter` reflects over your registry subclasses, walks their resource types' `[Export]` fields, discovers sub-resource types transitively, and writes `bleepforge_manifest.json` at your project root. The Bleepforge editor (Phase 4+) reads this manifest to drive its authoring surfaces. A `Tools → Re-export Bleepforge manifest` menu item provides a manual re-trigger.
- **6 attributes for fields/classes the C# type system can't express on its own:** `[BleepforgeFlag]` (string vs flag), `[BleepforgeShowWhen("OtherField", value)]` (discriminated-union field gating), `[BleepforgeNullable]` (sub-resources/arrays may be absent), `[BleepforgeArrayContainer(ArrayContainerKind.Typed)]` (typed-collection literal for `Godot.Collections.Array<T>`), `[BleepforgeView(ViewKind.Graph)]` (editor surface picker on a Resource class), `[BleepforgeOverrideUi("ComponentName")]` (mount a bespoke React component instead of the generic), `[BleepforgeDomain("name")]` (override the registry-class-name → domain-name heuristic).

### How field types are inferred

The emitter maps C# types to manifest field types as follows:

| C# type | Manifest type | Notes |
| --- | --- | --- |
| `string` | `string` | Default for plain `[Export] string`. |
| `string` + `[Export(PropertyHint.MultilineText)]` | `multiline` | Auto-detected from the export hint. |
| `string` + `[BleepforgeFlag]` | `flag` | Disambiguates from string. |
| `int` / `long` / `short` | `int` | |
| `float` / `double` | `float` | |
| `bool` | `bool` | |
| Any C# `enum` | `enum` | Values from `Enum.GetNames`. |
| `Texture2D` | `texture` | |
| `PackedScene` | `scene` | |
| BleepforgeResource subclass | `ref` | Target domain derived from the class. |
| Other Resource subclass | `subresource` | Treated as inline sub-resource; recursively emitted to the manifest's `subResources` list. |
| `T[]` / `Godot.Collections.Array<T>` of BleepforgeResource | `array` with `itemRef` | Array of refs. |
| `T[]` / `Godot.Collections.Array<T>` of other Resource | `array` with `of` | Array of inline sub-resources. |

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
├── addons/bleepforge/                            The Godot plugin
│   │                                             (drops into <user-project>/addons/)
│   ├── plugin.cfg                                Godot plugin manifest
│   ├── BleepforgePlugin.cs                       [Tool] EditorPlugin entry point
│   ├── runtime/                                  User-extensible base classes
│   │   ├── BleepforgeResource.cs                 Marker base for authored Resources
│   │   ├── BleepforgeRegistry.cs                 Generic flat registry
│   │   ├── BleepforgeFolderedRegistry.cs         Composite-id grouping
│   │   ├── BleepforgeDiscriminatedRegistry.cs    Variant routing
│   │   ├── BleepforgeEnumRegistry.cs             One-per-enum-value
│   │   └── Attributes.cs                         User attributes (BleepforgeFlag,
│   │                                             ShowWhen, View, OverrideUi,
│   │                                             ArrayContainer, Nullable, Domain)
│   └── editor/                                   Editor-only code (#if TOOLS)
│       ├── ManifestModel.cs                      POCOs mirroring the manifest JSON shape
│       └── ManifestEmitter.cs                    Reflection + JSON write
├── test-project/                                 Synthetic validation project
│                                                 (lands in Phase 5)
├── LICENSE                                       Apache 2.0
└── README.md                                     this file
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
