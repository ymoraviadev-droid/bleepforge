# godot-lib — the Godot side of Bleepforge

A small companion library you drop into your Godot 4 / C# project to make it Bleepforge-compatible.

**Status: v0.0.4 — library stable through v0.2.8.** The library + emitter + Bleepforge consumer chain is exercisable today against [test-project/](test-project/) — a minimal Godot project with all four entry kinds. The Bleepforge editor now ships its full round-trip pipeline for manifest-declared domains: v0.2.7 added the generic .tres mapper (writer half), v0.2.8 added the generic .tres importer (reader half) + JSON cache + watcher reimport + round-trip harness. Edit UI + FoB port land in v0.2.9. AssetLib publish stays deferred until the v0.3.0 headline cut.

- **Phase 1** ✓ — folder structure, `plugin.cfg`, placeholder GDScript stub, Apache 2.0 LICENSE.
- **Phase 2** ✓ — C# library tier 1: `BleepforgeResource` + 4 registry base classes. Walk paths, index by key, opt-in editor hot reload.
- **Phase 3** ✓ — Manifest emitter. `ManifestEmitter` reflects over registry subclasses + their resource types, builds a `Manifest` POCO matching the zod schema in [shared/src/manifest.ts](../shared/src/manifest.ts), writes `bleepforge_manifest.json` at the Godot project root. Triggered automatically on plugin enter-tree (editor load) and via a `Tools → Re-export Bleepforge manifest` menu item. Build hook (CI) deferred to a later release.
- **Phase 4** ✓ — Editor-side manifest consumption (lands in the Bleepforge editor, not here). Server reads + parses + validates via shared zod schema; new Diagnostics → Manifest tab surfaces detection state. NO UI changes to existing FoB workflows.
- **Phase 5** ✓ — Validation harness at [test-project/](test-project/). Synthetic Godot 4.4+ project with 4 BleepforgeResource subclasses covering all 4 entry kinds: `Note` (domain), `Snippet` (foldered, groupBy=ParentDir), `ElementData` (enumKeyed over a 4-value enum), `Equipment` (discriminatedFamily with `Sword` + `Shield` variants). 13 sample `.tres` files demonstrate the round-trip. See [test-project/README.md](test-project/README.md) for the walkthrough.
- **Phase 6** — Docs + release. AssetLib publish via release artifact pointing at the `addons/bleepforge/` subfolder, Help library entry, release notes, stable bump.

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

## Installation

1. Copy the `addons/bleepforge/` folder into your Godot project's `addons/` directory.
2. Open your project in the Godot editor.
3. **Build C# first.** Click the hammer icon (top-right) or Project → Tools → C# → Build Project. Wait for "Build successful" in the Output panel.
4. Project → Project Settings → Plugins → enable **Bleepforge**.
5. The library writes `bleepforge_manifest.json` at your project root immediately.
6. Point Bleepforge at your Godot project (sync mode) — the Manifest tab in Diagnostics shows the parse result. v0.2.7 surfaces the discovery + identity-only list pages; v0.2.8 populates the JSON cache so the list pages render field values too. Generic edit UI lands v0.2.9.

> **Why step 3 matters:** Godot's plugin loader runs before the project's C# build by default. If you skip the manual build on first install, Godot will try to enable Bleepforge against an empty assembly, fail with `Unable to load addon script from path: 'res://addons/bleepforge/BleepforgePlugin.cs'`, and silently disable the plugin. After step 3 builds the assembly, step 4's enable works on first try. **Subsequent project opens work normally** — the build runs alongside the editor and the plugin loads cleanly. This is a Godot 4 C# addon platform limitation; every C# addon hits it on fresh install.

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
