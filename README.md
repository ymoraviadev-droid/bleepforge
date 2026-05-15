# Bleepforge

**A schema-driven content authoring studio for Godot projects.**

Bleepforge is the editor your `[GlobalClass]` resources have always wanted: a focused, opinionated UI for building game content - dialogues, quests, items, karma impacts, NPCs, factions, balloons, project-specific concept categories, and shaders - that round-trips losslessly to and from Godot's `.tres` files (or for shaders, the `.gdshader` files themselves). The Godot project stays the source of truth; Bleepforge gives you the human-friendly surface on top of it.

Currently bootstrapped against [Flock of Bleeps](projects/flock-of-bleeps/data/concept.json), an in-development 2D adventure-platformer about a not-very-bright robot judged worthless and dumped in a landfill. Long-term direction is to be generic for any Godot project's content (see [Roadmap](#roadmap)).

---

## Why

Godot's inspector is great for one resource at a time. It is not great for:

- Walking dozens of `DialogSequence` files to find the one that branches into the conversation you're editing.
- Keeping `QuestId` references consistent across `NpcData`, `Quest`, and dialogue choices.
- Visualizing branching dialogue as a graph instead of nested arrays inside arrays.
- Authoring icon / portrait / banner images and seeing where each one is used across the project.
- Sanity-checking that no `Choice.NextSequenceId` points at a deleted sequence.
- Everything an authoring workflow needs that isn't directly part of the runtime.

Bleepforge is what you reach for when the project gets big enough that "open the inspector" becomes the bottleneck.

---

## What it does

### Authoring surfaces

Thirteen distinct surfaces, each tailored to one slice of the work:

| Surface | What it is |
|---|---|
| **Workbench** | The app's overview / homepage (v0.2.4). Project header strip, stats grid per domain, recent activity feed, integrity strip. Bleepforge-only. |
| **Game concept** | The project's pitch / acts / faction roles. Bleepforge-only. Was the homepage pre-v0.2.4; now a regular surface. |
| **Dialogues** | Multi-folder graph view + list view. Drag nodes, draw edges, double-click edges to rename, per-edge dashed/curved/waypoint style. Per-folder layout persistence. |
| **Quests** | Objectives + rewards as discriminated unions, auto-managed flag strips, link-out to giver NPC. |
| **Items** | `ItemData` + `QuestItemData` polymorphism. Card/list views grouped by category. |
| **Karma impacts** | Per-faction karma deltas, range-clamped, free-form-id-keyed. |
| **NPCs** | Full authoring - portrait, dialogs, quest entries, loot tables, casual remarks (balloon refs). |
| **Factions** | The four enum-keyed factions with banners + descriptions. |
| **Balloons** | The "Hi there!" lines NPCs say when you walk up. Cards mimic in-game speech bubbles, type-speed animates on hover. |
| **Game Codex** | Bleepforge-only multi-category notebook with user-defined property schemas (Hazards, Locations, etc.). Never round-tripped to Godot - staging ground for concepts that don't yet have a hardcoded domain. |
| **Assets** | Browse every image in the project. "Used by N" reverse-lookup against `.tres` + `.tscn`. In-app editor: crop, tint, flip, auto-trim, ML / heuristic background removal, "Magic crop" subject detection. |
| **Shaders** | Browse every `.gdshader` in the project. CodeMirror editor with GDShader syntax + gutter diagnostics (parser + WebGL errors line-anchored) + live WebGL2 preview canvas: re-translates GDShader → GLSL ES on every edit, auto-generated uniform controls (sliders for `hint_range`, color pickers for `source_color`, AssetPickers for each `sampler2D`), per-sampler texture-unit allocation, helper-function support with auto-substituted built-ins, `hint_screen_texture` aliasing for post-process shaders, ping-pong framebuffers + `hint_previous_frame` for trails / iterative effects. Cards also carry a user-pickable **pattern** (10 hand-designed pixel-art tiling SVGs — scanlines / bars / grid / lattice / diagonal / waveform / rings / bricks / circuit / stars) so you can tell two shaders apart at a glance. |
| **Help** | Bleepforge-only documentation library (11 categories, 67 entries shipped — including a **Release notes** category with one entry per version). Dev-mode-gated authoring. |

### Cross-cutting features

- **Two-way `.tres` sync.** Save in Bleepforge → atomic write to the matching `.tres`. Save in Godot → live watcher reimports and refreshes any open editor. No "click reimport" button.
- **Boot-time reconcile.** Every server start rebuilds the JSON cache from `.tres` via the **ProjectIndex** — a content-driven runtime index that classifies every `.tres` by what it is (script_class / Slug presence) and every `.tscn` with a `DbItemName` as a pickup, with no hardcoded folder conventions anywhere. Move files around inside your Godot project freely; Bleepforge finds them at next boot. If you edit Godot while Bleepforge is off, the next launch picks it up. No drift.
- **Live SSE.** Four event channels (sync / saves / assets / shaders) drive auto-refresh, toast notifications, and the live save-activity feed in real time. Shaders participate in the full sync surface — catalog refresh, Saves tab activity feed, and toasts on external add/change/remove (with per-window suppression so your own save doesn't double-feedback).
- **Diagnostics page.** Six tabs - Integrity, Reconcile, Logs, Saves, Process, Watcher - with severity-aware unified header icon. The save activity feed is SSE-pushed and updates as you edit.
- **App-wide search** at `Ctrl+K` - substring matching across every authored entity by id and display name. No fuzzy-typo-tolerance to keep results predictable.
- **Theming.** Eight color themes (dark / light / red / amber / green / cyan / blue / magenta) plus tunable body font, UI scale, and letter spacing. Bundled into named "global themes" you can save and switch between.
- **Desktop wrap (Electron).** Run as a desktop app via `pnpm dev:desktop`. Diagnostics / Help / Preferences open as chromeless popouts with cross-window state sync.

---

## Quick start

### Prerequisites

- **Node.js ≥ 20** (the engines field enforces this)
- **pnpm ≥ 10** (`npm install -g pnpm`)
- A **Godot 4 / C#** project to point at (currently shaped around the [Flock of Bleeps](projects/flock-of-bleeps/data/concept.json) schema)

### Install

```bash
git clone https://github.com/ymoraviadev-droid/bleepforge.git
cd bleepforge
pnpm install
```

The Electron postinstall downloads a ~150 MB Chromium binary on first install. If pnpm skips it (the v10 default for new packages), the root `package.json` already has `pnpm.onlyBuiltDependencies: ["electron"]` to permit it. If for any reason it still doesn't fire:

```bash
node node_modules/.pnpm/electron@*/node_modules/electron/install.js
```

### Configure

Copy `.env.example` → `.env` and point `GODOT_PROJECT_ROOT` at your Godot project:

```bash
cp .env.example .env
$EDITOR .env
```

```dotenv
GODOT_PROJECT_ROOT=/home/you/Godot/your-project
PORT=4000           # optional, default 4000
DATA_ROOT=data      # optional, default ./data
ASSET_ROOT=/home/you  # optional, defaults to $HOME
```

The Godot project root is required for the server to read or write `.tres` files in **sync mode** (the only mode pre-v0.2.5). v0.2.5 introduced two more modes — **notebook** (standalone, no Godot connection) and **import-once** (snapshot a Godot tree into a notebook). For a sync-mode project the env var here is the bootstrap fallback; once the v0.2.5 migration runs, the canonical source is the active project record (see [Multi-project](#multi-project) below). Notebook projects ignore the env var entirely.

### Run (browser)

```bash
pnpm dev
```

- Vite dev server on http://localhost:5173
- Express API on http://localhost:4000 (proxied via Vite at `/api/*`)

### Run (desktop)

```bash
pnpm dev:desktop
```

Same dev servers + an Electron window. Maximized, no menu bar, hot reload preserved. Diagnostics / Help / Preferences each open as their own chromeless popout. Closing the main window closes any open popouts and quits the app.

> **Note:** the Electron launcher hardcodes `http://localhost:5173`. Kill any other `pnpm dev` running before `pnpm dev:desktop` or the desktop window may load the wrong dev session. Override with `VITE_DEV_URL=http://localhost:5174 pnpm dev:desktop` if needed.

### Build (packaged installers)

```bash
pnpm dist        # both platforms: Linux AppImage + Windows NSIS installer
pnpm dist:linux  # Linux AppImage only
pnpm dist:win    # Windows NSIS installer only (cross-build from Linux supported)
```

**Linux** produces `electron/release/Bleepforge-<version>-x86_64.AppImage` (~115MB, single file, no install). Double-click to run; user state persists at `~/.config/Bleepforge/projects/<slug>/`. Run `pnpm install:desktop` once to register the app in the KDE / GNOME application menu with pre-cached thumbnails.

**Windows** produces `electron/release/Bleepforge-Setup-<version>-x64.exe` (~86MB), an NSIS installer with the full wizard (welcome → install location → install), per-user install (no admin prompt), desktop + start menu shortcuts, and a working uninstaller. Unsigned — first install shows one SmartScreen warning the user clicks through with **More info → Run anyway**. User state persists at `%APPDATA%\Bleepforge\projects\<slug>\`.

**Cross-building Windows from Linux** requires a dedicated 64-bit Wine prefix at `~/.wine64-bleepforge` — electron-builder's `rcedit` step (sets `.exe` metadata + embeds the icon) needs to operate on a 64-bit target, and a 32-bit Wine prefix can't manipulate it. First-time setup:

```bash
WINEPREFIX=~/.wine64-bleepforge WINEARCH=win64 \
  WINEDLLOVERRIDES='mscoree=;mshtml=' wineboot --init
```

`pnpm dist:win` defaults `WINEPREFIX` to that path automatically; override via env var if you want a different prefix.

The Help library ships inside both builds and seeds into userData on first launch when missing; on subsequent upgrades, only *new* help entries from the bundled seed are merged in — your edits to existing entries are never overwritten. Concept, Codex, and the `.tres`-derived domain JSONs are user-authored and start empty — point Bleepforge at your Godot project via the first-run welcome screen (or Preferences after first run), restart, and the cache rebuilds from `.tres`.

The build pipeline runs in four steps: client build (Vite) → server bundle (esbuild — workspace deps inlined, npm deps external) → electron main (tsc) → electron-builder (asar packaging + AppImage / NSIS assembly). Build output lives in `electron/release/` and is gitignored (~400MB per build).

macOS (.dmg) is a config-only follow-up. Auto-update + code signing are deferred until distribution is something other than "the user runs the installer from disk."

---

## Architecture

```
.tres (Godot project)  ⇄  Bleepforge server  ⇄  React UI
  ↑   canonical            (Express + watcher)    (Vite)
  └─── source of truth ─────────┘
                                 │
                                 └──► JSON cache in projects/<slug>/data/<domain>/
                                      (rebuilt on boot, kept live by chokidar,
                                      pushed back to .tres on every save —
                                      only in sync-mode projects)
```

- `.tres` is canonical; `projects/<slug>/data/<domain>/<id>.json` is a **derived cache**, rebuilt on every server start and kept in sync afterward. The cache JSONs are `.gitignore`d (machine-local, regenerated on boot) — never hand-edited; drift gets reconciled away on the next boot.
- Bleepforge-only **authored** state IS tracked in git: `concept.json`, per-folder `dialogs/<folder>/_layout.json`, the entire `codex/` tree, the entire `help/` tree, `shaders/_meta.json`. `preferences.json` (theme + Godot project root) is gitignored as machine-specific, along with `projects.json` and `active-project.json` which carry per-machine absolute paths.
- Schemas live in `shared/src/`, validated at the server boundary on read and write.

For the deep-dive reasoning behind every architectural choice, see [CLAUDE.md](CLAUDE.md). It's the project bible - schema definitions, design decisions, write-back internals, watcher behavior, theme system, the lot.

---

## Multi-project

As of v0.2.5 a single Bleepforge install holds many projects, exactly one **active** at a time. The active-project chip in the sidebar (under the BLEEPFORGE wordmark) shows which one you're editing; click it to open `/projects` and switch. Three creation flows from the `+ New project` button on that page:

- **Notebook** — standalone. Bleepforge owns the data + assets + shaders inside the project. No Godot connection.
- **Sync to Godot** — pick a Godot folder. Two-way live sync: `.tres` files are canonical, Bleepforge mirrors them as JSON on every boot and writes edits back on save; the watcher catches Godot-side changes live.
- **Import once from Godot** — snapshot a Godot tree into a fresh notebook. `.tres` data lands as JSON, referenced images + shaders get copied into the new project's `content/` dir, refs are rewritten to the portable `content://` URL scheme. After the snapshot the project is independent.

Switching projects hot-reloads the server in-process (~15ms) — no app restart required, no window flash. `POST /api/projects/reload` re-reads the active pointer + record and rebuilds the watcher, caches, and index against the new state. Works identically in dev and packaged modes. Rename + Delete live on each card's `⋯` menu; sync-mode projects' Godot trees are never touched by delete regardless of choice — Bleepforge only deletes what it owns.

The legacy `data/` layout (pre-v0.2.5) migrates automatically on first boot: contents move to `projects/<slug>/data/`, slug derived from `concept.json`'s Title, the Godot root pulled out of `preferences.json` into the new project record.

---

## Project structure

```
bleepforge/
├── shared/            TypeScript types + zod schemas (the contract)
├── server/            Express + TS - REST API, .tres parser/writer, watcher
├── client/            React + TS + Tailwind + Vite - every authoring UI
├── electron/          Electron main process + preload (desktop wrap)
├── godot-lib/         Godot companion library (v0.2.6 — scaffolding only)
├── projects.json      Multi-project registry (gitignored — absolute paths)
├── active-project.json Active-project pointer (gitignored)
└── projects/<slug>/   Per-project storage
    ├── data/          Derived JSON cache + Bleepforge-only state
    │   ├── concept.json   The project pitch (Bleepforge-only)
    │   ├── preferences.json  Active theme + Godot project root (gitignored)
    │   ├── dialogs/<folder>/   Per-folder dialog cache + _layout.json
    │   ├── balloons/<model>/   Per-NPC-model balloon cache
    │   ├── codex/<category>/   Game Codex (Bleepforge-only, never round-trips)
    │   ├── help/<category>/    Help library (Bleepforge-only)
    │   ├── shaders/_meta.json  Per-shader pattern + color
    │   ├── quests/, items/, karma/, npcs/, factions/  Flat-domain caches
    └── content/       Notebook-mode assets + shaders (not present in sync mode)
```

pnpm workspace; each package has its own `tsconfig.json` and shares strict TypeScript across the monorepo.

---

## Scripts

Run from the repo root:

| Command | What it does |
|---|---|
| `pnpm dev` | Start server (`tsx watch`) + client (`vite`) in parallel - browser workflow |
| `pnpm dev:desktop` | Same as `pnpm dev` plus the Electron window |
| `pnpm dist` | Build packaged binaries for both platforms — Linux AppImage + Windows NSIS installer (Vite + esbuild + tsc + electron-builder) |
| `pnpm build` | Build all workspaces (`tsc` for shared/server/electron, `vite build` for client) |
| `pnpm typecheck` | Run `tsc --noEmit` across all workspaces |
| `pnpm sync:from-userdata` | Pull AppImage edits back into the repo (`~/.config/Bleepforge/projects/<slug>/data/` → `./projects/<slug>/data/`). Walks every project on either side; dry-run + confirm by default; `-y` to skip prompt. |
| `pnpm sync:to-userdata` | Push repo content into the running AppImage's userData (opposite direction). |

Server-side dev tools (run via `pnpm --filter @bleepforge/server <name>`):

| Command | What it does |
|---|---|
| `harness` | Walk every `.tres` and confirm parser+emitter is byte-identical (round-trip test) |
| `canary <slug>` | Apply a JSON edit to one `.tres` and show the unified diff (Item) |
| `canary-karma <id>` | Same, for KarmaImpact |
| `canary-dialog <folder> <id>` | Same, for DialogSequence |
| `canary-quest <id>` | Same, for Quest |
| `migrate-subids` | One-shot migrator that adds `_subId` fields to existing JSON for reorder-safe writes |

---

## Tech stack

- **Frontend:** React 19, TypeScript, Tailwind v4, Vite 6, [@xyflow/react](https://reactflow.dev/) (graph view), [Fuse.js](https://fusejs.io/) (search), [@imgly/background-removal](https://www.npmjs.com/package/@imgly/background-removal) (ML bg removal)
- **Backend:** Express 5, TypeScript, [chokidar](https://github.com/paulmillr/chokidar) (watcher), [zod](https://zod.dev/) (schema validation)
- **Desktop:** Electron 33 (main process + preload only - renderer is the same React app)
- **Persistence:** Godot's `.tres` format (canonical) + JSON cache (derived) - both committed to git
- **Conventions:** ES modules end-to-end except Electron's main (CJS); strict TypeScript including `noUncheckedIndexedAccess` + `noImplicitOverride`; pnpm workspaces

---

## Roadmap

**Done:**

- All 12 authoring surfaces
- Two-way `.tres` sync (boot reconcile + live watcher + on-save writeback)
- Diagnostics page (6 tabs)
- App-wide search
- Theming + global theme bundles + cross-window theme sync
- Assets gallery + image editor with ML / heuristic bg removal
- Game Codex (user-defined category schemas)
- Shaders surface with CodeMirror editor (+ GDShader syntax + gutter diagnostics) + WebGL2 live preview + GDShader → GLSL ES subset translator with multi-texture + helper-function support + sampler hints + `hint_screen_texture` + ping-pong framebuffers for `hint_previous_frame` (trails / iterative effects). Full sync parity with the `.tres` domains — catalog refresh, Saves tab integration, cross-window toasts.
- In-app Help library
- Electron desktop wrap (dev + Linux AppImage + Windows NSIS installer via `pnpm dist` / `pnpm dist:win`)
- **First-run welcome flow** for packaged builds (v0.2.3) — when no `preferences.json` exists yet, the renderer shows a native folder picker instead of a broken-looking shell.

**In progress (v0.2.6 → v0.3.0):**

- **Genericize for any Godot project.** Three intermediate releases land between today and v0.3.0:
  - **v0.2.6** (in progress) — manifest contract + library tier 1 (abstract base classes for the four entry kinds: `domain` / `discriminatedFamily` / `foldered` / `enumKeyed`) + editor reads manifest. Phase 0 (zod schema in [shared/src/manifest.ts](shared/src/manifest.ts)) shipped 2026-05-16. Editor UI does NOT change; FoB workflow stays unchanged.
  - **v0.2.7** — generic editor surfaces + override mechanism. Generic `<DomainList>` + `<DomainEdit>` driven by manifest field declarations; generic `.tres` mapper for writeback; bespoke FoB UIs (DialogGraph, NpcEdit, BalloonCard) keep working via override. v0.2.7 = "Bleepforge edits any project that has a manifest."
  - **v0.2.8** — schema authoring + C# stub generation. Define new domains in Bleepforge → library generates C# stubs into your Godot project → you wire runtime logic via `partial class` → manifest re-exports → Bleepforge sees it.
  - **v0.3.0** — headline cut: "Bleepforge is generic." Polish, docs, the advertise-able release.

  See the **Genericization arc** section in [CLAUDE.md](CLAUDE.md) for the full design — manifest spec (4 entry kinds + 12 field types), locked decisions (monorepo, no FoB port required, tiered library, no demo game), 7-phase plan for v0.2.6.

**Next:**

- **macOS packaging + auto-update + code signing.** Deferred until distribution is something other than "the user runs the installer from disk." macOS (.dmg) is a config-only follow-up to the existing electron-builder pipeline. Windows NSIS shipped unsigned in v0.2.3.

---

## Authoring philosophy

Some opinions baked into Bleepforge worth knowing if you fork or contribute:

- **Three persistence channels per save** (memory state → localStorage cache → server) - the user always sees their last-applied state instantly even if the server save is in flight or fails.
- **Schema mirrors the Godot resource fields 1:1.** PascalCase keys, same field names. Pays off for manual transcription today, keeps `.tres` parsing viable later.
- **Enums serialize as strings in JSON** (`"QuestItem"`, `"CollectItem"`, `"Scavengers"`) - readable in diffs, robust to reordering - and as ints in `.tres` (Godot's choice).
- **Click on any image opens a preview, not the editor.** Editing is always via right-click. One rule everywhere; no accidental modal opens.
- **Defense in depth on path safety.** The writer refuses any target outside the resolved Godot project root, every file-touching server endpoint validates via `path.relative + startsWith("..")`, atomic writes (temp + rename) for both `.tres` and image saves.
- **Don't trust client-side state alone.** Every PUT is validated server-side via the same zod schemas the client uses; structural compat between client and server is the contract enforced at the boundary.

---

## License

Bleepforge is open source, with a deliberate split between library and editor:

- **`godot-lib/`** (the Godot companion library that ships into your Godot project) — **Apache License 2.0**. Permissive: drop it in without thinking. See [godot-lib/LICENSE](godot-lib/LICENSE).
- **The editor** (`client/`, `server/`, `shared/`, `electron/`, plus everything else in this repo) — **GNU Affero General Public License v3 or later**. Copyleft: forks must remain open, including SaaS hosts. See [LICENSE](LICENSE).

Why the split: a permissive license on the library maximizes adoption (game devs drop it into their projects without worrying about license compatibility); a copyleft license on the editor prevents rebadge-and-monetize forks (any fork must also be AGPL, removing the financial incentive to take Bleepforge, slap a new name on it, and sell it). Apache 2.0 + AGPL v3 are both OSI-approved open-source licenses.

The names **"Bleepforge"** and **"godot-lib for Bleepforge"** and the Bleepforge logo are unregistered trademarks of Yehonatan Moravia. Forks are welcome under the licenses above; use a different name. See [TRADEMARK.md](TRADEMARK.md) for the full policy.

Premium tier-2 add-ons (DialogRunner, FlagStore, KarmaApplier, and similar opinionated runtime helpers) are deferred indefinitely. If they ever ship, they'll be separate proprietary products, not subject to AGPL — AGPL covers the editor itself, not separately-distributed add-ons you build alongside it.

Copyright © 2026 Yehonatan Moravia.

---

## Authors

Authored by **Yehonatan Moravia** & **Archie** - `ymoravia.dev@gmail.com`

Bleepforge is built collaboratively. Documentation evolves alongside the code; CLAUDE.md and this README are the running record. PRs and issues welcome if you're working on a similarly-shaped Godot project and want to fork the editor toward your own schema.
