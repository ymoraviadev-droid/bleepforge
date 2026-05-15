# godot-lib — the Godot side of Bleepforge

A small companion library you drop into your Godot 4 / C# project to make it Bleepforge-compatible.

**Status: v0.2.6 Phase 1 — scaffolding only.** This folder is the monorepo home for the library; nothing is functional yet. Subsequent phases ship the actual code:

- **Phase 1** (this commit) — folder structure, `plugin.cfg`, placeholder GDScript stub so the plugin loads cleanly into Godot but does nothing yet, Apache 2.0 LICENSE.
- **Phase 2** — C# library tier 1: `BleepforgeResource` (marker base class), `BleepforgeRegistry<T>`, `BleepforgeFolderedRegistry<T>`, `BleepforgeDiscriminatedRegistry<TBase>`, `BleepforgeEnumRegistry<TEnum, T>`. All registries walk paths, index by key, hot-reload on `.tres` change.
- **Phase 3** — Manifest emitter. Library reflects over `BleepforgeResource` subclasses, builds the manifest, writes `bleepforge_manifest.json` at the Godot project root. Three triggers: editor-load auto-export (default), manual menu button, build hook.
- **Phase 4** — Editor-side manifest consumption (lands in the Bleepforge editor, not here).
- **Phase 5** — Validation harness. Tiny synthetic Godot project at `godot-lib/test-project/` with 2-3 resource types covering different kinds (`domain` + `foldered` minimum). Library exports manifest, editor reads it, registry hot reload works. NOT FoB.
- **Phase 6** — Docs + release. AssetLib publish via release artifact pointing at the `addons/bleepforge/` subfolder.

## What it will do (when functional)

- **Provide registry base classes** so the user's authored resource types automatically index themselves at runtime, walk their declared folder paths, and hot-reload when `.tres` files change. Saves the user from writing per-domain autoload singletons by hand.
- **Emit the Bleepforge manifest** — a JSON file at the project root that describes every `BleepforgeResource` subclass: which kind of entry it is (`domain` / `discriminatedFamily` / `foldered` / `enumKeyed`), what fields it has, the editor surface it wants (`list` / `cards` / `graph`), and any bespoke override UI to mount instead of the generic. The Bleepforge editor reads this manifest and drives every authoring surface from it.

## Installation (planned, post-Phase 3)

1. Copy the `addons/bleepforge/` folder into your Godot project's `addons/` directory.
2. Open your project in the Godot editor.
3. Project → Project Settings → Plugins → enable **Bleepforge**.
4. The library writes `bleepforge_manifest.json` at your project root on the next editor load.
5. Point Bleepforge at your Godot project (sync mode) — the manifest drives the editor surfaces.

Today none of this works yet — the scaffolded plugin loads but is a no-op.

## Compatibility

- **Godot 4** (4.x). Targeting current stable.
- **C#** (Mono / .NET). The library's runtime classes are written in C#; users extend via `partial class` once Phase 2 lands.
- **Cross-platform** by construction — no platform-specific code, the library is pure C# + reflection.

## Layout

```text
godot-lib/
├── addons/bleepforge/      The Godot plugin (drops into <user-project>/addons/)
│   ├── plugin.cfg          Godot plugin manifest
│   └── bleepforge.gd       Placeholder GDScript stub (Phase 1) — Phase 2 swaps to C#
├── test-project/           Synthetic validation project (lands in Phase 5)
├── LICENSE                 MIT
└── README.md               this file
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
