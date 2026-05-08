# Bleepforge

**A graph-based project organizer / planning tool** for Yonatan's Godot game **Flock of Bleeps** (formerly placeholder "AstroMan" — the C# namespace and project folder still use the old name). Visualizes and documents **dialogues** (the headline feature: a graph view), plus **quests**, **items**, **karma impacts**, **NPCs**, and **factions**. Also serves as the project bible — see [data/concept.json](data/concept.json) for the canonical pitch, acts structure, and faction roles.

**`.tres` is canonical, JSON in `data/` is a derived cache.** The Godot `.tres` files are what the game runtime loads, so they're the source of truth: anything that ships is what's in `astro-man/`. Bleepforge's JSON in `dialoguer/data/{dialogs,quests,items,karma,npcs,factions}/` is a cache rebuilt from `.tres` on every server start, kept in sync afterward by the live watcher, and pushed back to `.tres` on every save. We still commit the JSONs to git as a redundant safety net (so historical states are queryable from either side), but they should never be edited by hand — any drift gets reconciled away on the next boot. Three Bleepforge-only files are **not** part of the cache and are authoritative state: `data/concept.json`, `data/preferences.json`, and per-folder `data/dialogs/<folder>/_layout.json` (graph node positions and edge styles).

**Godot project on disk**: `/home/ymoravia/Data/Projects/Godot/astro-man/`. The project root is **required** — Bleepforge refuses to start without it (no project root → nothing to read or write, so we fail fast instead of presenting an empty UI). Resolution order at boot: `data/preferences.json#godotProjectRoot` (set in-app via Preferences) → `GODOT_PROJECT_ROOT` env var → fail. The env var is the bootstrap fallback for first run before preferences exist; once you save a path in Preferences, that takes priority. Changes to the saved value require a server restart (no hot-swap — the resolved value is captured once at module init). Defense in depth: the writer refuses any target outside the resolved root. The schema sections below mirror the Godot Resource fields 1:1 so the mappers can apply JSON edits to the corresponding `.tres` properties.

## Stack

- **Frontend**: React + TypeScript + Tailwind + Vite
- **Backend**: Express + TypeScript
- **Persistence**: `.tres` (canonical, in the Godot project) + JSON cache at `dialoguer/data/<domain>/<id>.json` (rebuilt on boot, kept live by the watcher)

## v1 plan (decided)

**Scope** — six data domains (Godot-mirrored) plus a Bleepforge-only concept doc:

1. Dialogs (`DialogSequence` / `DialogLine` / `DialogChoice`) — **CRUD + interactive graph view + multi-folder implemented**
2. Quests (`Quest` / `QuestObjective` / `QuestReward`) — **implemented**
3. Items (`Item`, `Category="QuestItem"` discriminates `QuestItemData`) — **implemented**
4. Karma impacts (`KarmaImpact` / `KarmaDelta`) — **implemented**
5. NPCs (`NpcData` — full authoring; `LootTable` editor + `Quests[]` editor both implemented) — **implemented**
6. Factions (`FactionData`) — **implemented**

Plus **Game concept** — a single Bleepforge-only doc (`data/concept.json`) used as the app homepage, *not* exported to Godot. Holds title, tagline, description, logo/icon/splash images, genre, setting, status, inspirations, notes. Covered in the "Architecture decisions" section below.

**Graph view interactions:**

- **Drag nodes** to reposition — saved per-folder to `data/dialogs/<folder>/_layout.json` on drag-stop.
- **Per-line outgoing handles**: every `DialogLine` has its own source handle (small emerald square on the right edge, vertically aligned to its row). Drag from the line you want the choice attached to. Edges encode `sourceHandle: "line-<idx>"`; `onConnect` uses it to pick the right line.
- **Drag-to-empty-space**: dropping a connection on empty canvas prompts (modal) for a new sequence id, creates the sequence with one empty line in the current folder, wires the source's choice to it, and saves the layout position at the drop point.
- **Right-click on empty canvas**: opens the context menu with a "Create new sequence" item — same prompt + placement as drag-to-empty, but standalone (no source-choice wiring). Right-click on a sequence node shows "Edit" / "Copy id". The drag-to-empty and right-click paths share a `createSequenceAtCursor` helper that captures coords at right-click time so the new node lands where the user clicked, even after the async prompt resolves.
- **Inline edge label editing**: double-click an edge's label → in-place input → Enter or blur saves the choice's `Text` (Esc cancels).
- **Edge shape, dashed/solid, waypoints (per-edge)** — selecting an edge shows an inline toolbar near the label with `∿ —  ▬ ╌` buttons (curved/straight, solid/dashed). Double-click the edge **path** (anywhere away from the label) → adds a waypoint at the click position. Drag waypoint markers (small emerald squares) to move; double-click waypoint to remove. Curved + waypoints = Catmull-Rom-to-Bezier smooth curve through all points; straight + waypoints = polyline.
- **Select edge(s) + Backspace/Del** — removes the corresponding `Choice` from the source sequence's line.
- **Select node(s) + Backspace/Del** — removes the sequence (after confirm). For ghost (dangling) nodes, "delete" sweeps every choice across the folder whose `NextSequenceId` matched the missing target.
- **Double-click node** → opens that sequence's edit form.
- **"Reset layout"** clears saved positions and edge styles for the folder; nodes fall back to dagre auto-layout, edges to default curved+solid.
- **Per-line handle Y is DOM-measured**, not constant-derived. Each line `<div>` carries a ref; a `useLayoutEffect` reads `offsetTop + offsetHeight/2` and pushes the values into `Handle` `style.top`, then calls `useUpdateNodeInternals(id)` so React Flow re-anchors attached edges. A `ResizeObserver` on the node container re-fires the measurement when fonts / UI scale / line-clamp reflow change layout (these don't trigger React renders by themselves). `lineRowMidYFallback` is kept as the initial-paint fallback so handles don't visibly snap into place on first render.
- **Sequence nodes grow naturally** (no inner `overflow-y-auto`, no `maxHeight`). Long sequences produce tall nodes — the canvas's pan/zoom handles navigation. Reasons: an inner scrollbar (a) clipped handles past the fold so they fell outside the node body, (b) overlapped the new themed scrollbar at `Position.Right`. Both classes of bug fixed by removing the scroll.
- **Per-folder viewport persistence**: pan + zoom save to `localStorage` under `bleepforge:graphViewport:<folder>` on `onMoveEnd` (user-initiated pan/zoom only — programmatic `setViewport` / `fitView` don't fire it). On entering a folder, the saved viewport is restored via `setViewport({ duration: 0 })`; first visits use `fitView({ padding: 0.4, duration: 0 })` for a generous "zoomed out, here's the whole map" framing. A `lastAppliedFolderRef` ref guards against re-firing when the user creates/deletes a sequence in the same folder.

**Layout file shape** (`data/dialogs/<folder>/_layout.json`):

```json
{
  "nodes": { "<sequenceId>": {"x": 0, "y": 0} },
  "edges": { "<sourceId>::<lineIdx>::<choiceIdx>": {"shape": "curved|straight", "dashed": false, "waypoints": [{"x":0,"y":0}]} }
}
```

Read+written through `GET/PUT /api/dialogs/:folder/_layout`; excluded from `listInFolder` (filename match on `_layout.json`). Old shape (`Record<id, {x, y}>`) is auto-migrated on read into the new `{nodes, edges}` form. Edge style updates flow through a `Bleepforge:edge-style` window event from the custom edge component to the graph host, which patches `layout.edges` and persists.

The `DialogGraph` exported component wraps `DialogGraphInner` in `<ReactFlowProvider>` so `useReactFlow().screenToFlowPosition` and `getZoom` work for waypoint drag math and drag-to-empty drop coordinates.

**Out of scope (and not coming back without explicit decision):**

- ~~**`NpcQuestEntry` editor**~~ — done. Add / remove / edit per-NPC quest entries (QuestId + 2 flag fields + 5 dialog refs) inline on the NPC form, with full `.tres` writeback.
- **`Pickup` (collectible scene) authoring**. We surface a read-only catalog of `.tscn` files for the LootTable picker (see "Pickups" below) but don't author the scenes themselves — sprite/collision/animation work needs Godot's scene editor.
- **`BalloonLine` authoring** — `CasualRemark` is an opaque `res://` path to a separate `BalloonLine` `.tres`. Not surfaced for editing.
- **Auto-import (Godot → Bleepforge)**: wired on two timescales — boot-time reconcile rebuilds the whole JSON cache from `.tres` whenever the server starts, and the live watcher reimports individual files on every Godot save while running. There used to be a manual "rebuild now" button in Preferences; it was removed once the automatic paths were trustworthy. To force a rebuild, restart the server.

**Next big move: wrap with Electron.** The feature set feels finished — every domain is fully authorable, two-way `.tres` sync is solid, the diagnostics surface covers integrity / reconcile / logs / process / watcher. Wrapping in Electron is the "1.0 desktop" moment. Rationale (vs Tauri): Electron's main process *is* Node, so Express boots in-process via a plain `require` — no sidecar, no Rust. Hot reload preserved (Vite HMR works in the desktop window same as the browser). SSE works unchanged. Once the terminal goes away inside a packaged binary, the diagnostics work pays off — that's why it shipped first.

**Architecture decisions:**

- **Monorepo with workspaces** (pnpm): `client/` (React + TS + Tailwind + Vite), `server/` (Express + TS), `shared/` (TS types + zod schemas — single source of truth for JSON shapes, imported by both sides).
- **Storage**: `dialoguer/data/<domain>/<id>.json`. Configurable via `DATA_ROOT` env (default: `data` relative to the Bleepforge project root).
- **One file per entity** — clean diffs, easy to inspect.
- **Local-only, no auth, no deploy.** Express on localhost, Vite dev server proxies `/api`. Single user.
- **Validation** via zod schemas in `shared/`, applied at the server boundary on read and write.
- **CRUD is generic for flat domains.** [server/src/util/jsonCrud.ts](server/src/util/jsonCrud.ts) provides `makeJsonStorage(schema, folder, keyField)` and `makeCrudRouter(schema, storage, keyField)`. Quests, Items, Karma, NPCs use it. **Dialogs are folder-aware** ([server/src/dialog/storage.ts](server/src/dialog/storage.ts) and [router.ts](server/src/dialog/router.ts)) — files live at `data/dialogs/<folder>/<id>.json`, where folders are speaker contexts (`Eddie`, `Krang`, etc., mirroring Godot's `DialogFolders.cs`). Folder + id are validated against `/^[a-zA-Z0-9_-]+$/` at the storage boundary.
- **Live image serving.** [server/src/asset/router.ts](server/src/asset/router.ts) exposes `GET /api/asset?path=<absolute>` to serve any image under `ASSET_ROOT` (defaults to `$HOME`) and `GET /api/asset/browse?dir=<path>` to list a directory (dirs + image files only). Used by NPC portraits/sprites, Item icons, DialogLine portraits, and the file-picker modal. `Cache-Control: no-cache` so file edits show immediately. Path traversal blocked by `path.relative` check.
- **File picker UX.** Browsers can't read absolute filesystem paths from `<input type="file">` (security), so Bleepforge ships its own [AssetPicker](client/src/AssetPicker.tsx) — a server-mediated modal that lets you click through `ASSET_ROOT`, see image thumbnails inline, and pick a file. The picker is used wherever an image path is authored.
- **Catalog + autocomplete.** [useCatalog](client/src/useCatalog.ts) loads all NPCs/items/quests/dialog sequences plus a derived flag set (every `SetsFlag` / quest flag value seen in the corpus). [CatalogDatalists](client/src/CatalogDatalists.tsx) mounts once at the App root and emits `<datalist>` elements (`DL.npcIds`, `DL.npcNames`, `DL.itemSlugs`, `DL.questIds`, `DL.sequenceIds`, `DL.flags`). Forms wire FK inputs to the appropriate datalist via `list={DL.X}`. The catalog refreshes automatically after every save/remove via a tiny pub/sub bus ([catalog-bus.ts](client/src/catalog-bus.ts)) hooked into the api wrappers.
- **Diagnostics page.** Unified diagnostic surface at [/diagnostics](client/src/diagnostics/DiagnosticsPage.tsx) — replaces what used to be two standalone pages (`/integrity` and `/reconcile`). Five tabs: **Integrity** (authored content — dangling FKs, duplicate ids, the checks `computeIssues` has always run), **Reconcile** (boot-time `.tres` → JSON cache rebuild), **Logs** (server-side log buffer), **Process** (server identity / uptime / config), **Watcher** (chokidar status + recent events). Each tab below has its own bullet. The header carries a single icon-only entry on the right side, next to the gear (both are *meta* actions about the app, not the project content) — pixel-art pulse waveform [DiagnosticsIcon](client/src/diagnostics/DiagnosticsIcon.tsx), stroke color shifts with severity (red error, amber warning, neutral when clean), small square numeric badge anchored to the icon's top-right corner when there's a count. Severity is the worst-of across the *severity-bearing* tabs (Integrity, Reconcile, Logs); Process and Watcher are informational and never bump the badge — failures that matter already surface elsewhere, double-counting would be noise. Hitting `/diagnostics` with no sub-route auto-routes to the dirtiest tab so a broken state surfaces immediately; `/integrity`, `/reconcile`, and the legacy `/health` paths all redirect to `/diagnostics/<tab>` for back-compat. The aggregate severity logic lives in [useDiagnostics](client/src/diagnostics/useDiagnostics.ts), shared between the page and the App-level header icon. Authored-data check (`computeIssues`) stays in [client/src/integrity/issues.ts](client/src/integrity/issues.ts) — pure, no UI imports — so both the tab and the hook can run it without coupling.

- **Logs tab.** Captures server-side `console.{log,info,warn,error}` into a 1000-entry ring buffer at [server/src/logs/buffer.ts](server/src/logs/buffer.ts) (monkey-patches console at module load — must be the first import in [server/src/index.ts](server/src/index.ts) so boot lines get captured). Buffer is exposed at `GET /api/logs`; `POST /api/logs/clear` wipes it (used by the Logs tab's "Clear" button for "give me a clean slate before reproducing a bug"). The [LogsTab](client/src/diagnostics/LogsTab.tsx) view renders newest-first with a 3-way filter — `All` / `Good` (info only) / `Bad` (warning + error) — and Refresh + Clear buttons. On first open, if the buffer contains any error/warning entries the filter defaults to `Bad` so the user lands on the relevant lines instead of scrolling. Boot-reconcile per-file errors flow through `console.error` (and skips through `console.warn`) so they tag correctly in the buffer; the same root cause is intentionally double-counted across the Reconcile and Logs tabs because the user's path to fix it is different in each case. **No SSE streaming yet** — fetch-on-demand only. New errors after page load don't update the header icon until the user reloads. SSE + virtualized live feed would be a substantial next step; the current shape captures the core value (history + filter) at a fraction of the cost.

- **Process tab.** Read-only "what is the running server" view at [/diagnostics/process](client/src/diagnostics/ProcessTab.tsx). Reports Bleepforge version, Node version, platform, PID, port, start time + formatted uptime, data root, asset root, and the resolved Godot project root + source. Common debugging path: "wait, is this server actually using the project I think it is?" — happens after editing prefs and forgetting to restart, or when running multiple checkouts. `GET /api/process` returns a one-shot snapshot; the tab has a Refresh button so uptime can be re-checked without leaving the page. Intentionally informational — never bumps the header diagnostics icon.

- **Watcher tab.** chokidar status + recent-events feed at [/diagnostics/watcher](client/src/diagnostics/WatcherTab.tsx). Answers "is the watcher firing when I save in Godot?" without forcing the user to dig through the Logs tab. The watcher records every debounced event (kind + path + outcome) into a 100-entry ring inside [server/src/tres/watcher.ts](server/src/tres/watcher.ts); outcomes cover the full happy and ignored paths — `reimported`, `deleted`, `ignored-self-write`, `ignored-not-domain`, `failed`. `GET /api/watcher` returns `{ active, root, watchedFileCount, recentEvents }`. Like the Process tab, this one's informational and doesn't affect header severity — failed reimports already surface via Logs (`console.error` capture), so double-counting them in the badge would just be noise.
- **Reusable modal.** [Modal.tsx](client/src/Modal.tsx) provides `showConfirm(opts)` and `showPrompt(opts)` imperative APIs that return Promises (no `useState` boilerplate at call sites). `ModalHost` is mounted once at the App root and reads from a module-level singleton + pub/sub bus. Used everywhere a confirm or prompt is needed (delete confirmations, graph reset-layout, drag-to-empty new-sequence prompt with validation, etc.). All native `window.confirm` / `window.prompt` calls have been removed. Pixel-themed styling matches the rest of the UI.
- **Back navigation.** Every Edit page (`/items/:slug`, `/quests/:id`, `/npcs/:npcId`, `/karma/:id`, `/dialogs/:folder/:id`) renders a `← Back to <list>` link at the top. The Dialog Edit's back link preserves the folder query param so you return to the correct graph.
- **Preferences page.** [/preferences](client/src/preferences/PreferencesPage.tsx), reached via the pixel gear icon in the header (replaced the always-visible theme swatch row). Four sections: Godot project, Global theme, Color theme, Typography — all persisted to `data/preferences.json`. The Godot-project section holds the project root override (text input + live validation against [/api/godot-project/validate](server/src/godotProject/router.ts) which checks for `project.godot`); a "Restart server to apply" amber notice appears whenever the saved path differs from the running server's effective root, since config is captured once at boot and not hot-swapped. The old `/import` route still redirects here for back-compat; the import-from-Godot section that used to live here is gone (boot-time reconcile + live watcher cover it automatically).
- **Theming.** Every theme is a CSS-only override on `[data-theme="X"]` of `<html>`, defined in [client/src/index.css](client/src/index.css). Each block re-points the accent (`--color-emerald-*`) to a different Tailwind palette and re-tints the neutral scale toward the same hue with low chroma. Canvas tones (`--canvas-bg`, `--canvas-pattern`) are set per theme — invariant: canvas is always slightly darker than the page bg so the React Flow stage reads as recessed. Themes: dark, light, red, amber, green, cyan, blue, magenta. [client/src/Theme.tsx](client/src/Theme.tsx) holds the registry + `useTheme` hook + early-applies the saved theme to avoid flash. [client/src/themeColors.ts](client/src/themeColors.ts) exposes `useThemeColors()` to JS that needs the live computed values (SVG strokes, marker fills inside React Flow that can't be Tailwind classes). The base `@theme` block also defines two extra palettes — `--color-source-npc-*` (warm/orangish, defaults to amber) and `--color-source-terminal-*` (cool/greenish, defaults to green) — used for the dialog SourceType color coding. The `amber` theme overrides `source-npc` to point at orange so the NPC color stays distinct from the active accent; other themes keep the defaults.
- **Typography knobs.** [client/src/Font.tsx](client/src/Font.tsx) is the DOM-applier for body font (8 pixel families, native `<select>` with each option styled in its own family), UI scale (`--text-scale` on `:root`, drives `html { font-size }` so `rem`-based padding scales with text — true UI zoom, not text-only resize), and letter spacing (`--body-letter-spacing` on `<body>`, mono keeps its hard 0 override). Display font (Press Start 2P) and mono (VT323) stay fixed. The 7 added body fonts beyond Pixelify Sans: Silkscreen, Jersey 10, Tiny5, DotGothic16, Handjet, Workbench, Sixtyfour — all on Google Fonts so no additional infra. Persistence flows through [GlobalTheme](client/src/GlobalTheme.tsx) (see "Global themes" below) — Font.tsx exposes setters and getters but no longer owns the storage.
- **Global themes.** Color theme + body font + UI scale + letter spacing are bundled into a named "global theme". Users can save the current values as a new theme via Preferences and switch between them; the active theme is reapplied each session. Schema in [shared/src/preferences.ts](shared/src/preferences.ts) (plain string ids for color/font, validated client-side at apply-time so the canonical metadata stays alongside the React UI). Server: singleton router at `/api/preferences` (GET + PUT, mirrors `/api/concept`); file at [data/preferences.json](data/preferences.json). Client: [client/src/GlobalTheme.tsx](client/src/GlobalTheme.tsx) holds state + pub/sub + wrapped setters that apply DOM via Theme/Font and persist into the active theme record. Boot is two-phase — synchronous read from a localStorage cache (`bleepforge:globalThemesCache`) for instant paint, then async fetch from the server reconciles. The "default" theme is built-in, always present, and can't be deleted (it's the safety fallback). Tauri-friendly: same fetch pattern works in the desktop webview, and the localStorage cache means the app paints correctly even before the server fetch resolves.
- **Themed scrollbars.** Track + thumb resolve through `--color-neutral-*` so they re-tint per theme (light themes get a darker thumb on a lighter bg, dark themes the inverse — both directions land naturally). Hover/active uses the accent so grabbing the bar gives a theme-colored "lit up" cue. Webkit pseudos for the hover state, `scrollbar-color` for Firefox.
- **Pickups (collectible scenes)** are a read-only catalog Bleepforge surfaces for the NPC LootTable picker. [server/src/pickup/router.ts](server/src/pickup/router.ts) walks `world/collectibles/<name>/<name>.tscn` in the Godot project and parses each scene's `[gd_scene]` UID + the root node's `DbItemName` property. Served at `GET /api/pickups`, cached 30s. The integrity check flags any `LootEntry.PickupScene` whose path doesn't match a current pickup so Godot-side `.tscn` renames don't ship as silent breakage.
- **Typed-array literal output.** `serializeSubRefArray` + `reconcileSubResourceArray` accept an optional `typedArrayExtId`, emitting the property as `Array[ExtResource("<id>")]([SubResource(...)])` — required for C# fields declared as `Godot.Collections.Array<T>` (e.g. `NpcData.LootTable.Entries`). Plain `T[]` C# arrays (e.g. `KarmaImpact.Deltas`) leave it unset and get the bare-array form.
- **Orphan ext_resource cleanup.** Final post-pass in `runWrite` ([server/src/tres/writer.ts](server/src/tres/writer.ts)) walks the doc and drops any `[ext_resource]` whose id has zero `ExtResource("<id>")` occurrences in property values across all sections. Catches orphans introduced by the apply (e.g. swapping a LootEntry's PickupScene leaves the prior PackedScene ref unused) plus any pre-existing orphans. Conservative — only removes when the id literally never appears outside its own definition. `metadata/_custom_type_script` uses raw `uid://...` strings (not ExtResource refs) so it's correctly NOT counted as a usage. Removed ids are surfaced as a warning per save.
- **Game concept page** is the app homepage. Two routes mirroring the items / quests pattern: `/concept` shows [ConceptView](client/src/concept/View.tsx) (read-only homepage with hero block — splash image, logo, icon, title, tagline, meta row, long-form sections), `/concept/edit` shows [ConceptEdit](client/src/concept/Edit.tsx) (the form). `/` redirects to `/concept`. Single Bleepforge-only document at [data/concept.json](data/concept.json), served via a singleton router at `/api/concept` (GET + PUT, no list, no domain CRUD machinery). Schema in [shared/src/concept.ts](shared/src/concept.ts). All fields optional — missing images fall back to [PixelPlaceholder](client/src/PixelPlaceholder.tsx) variants so the layout has presence even when nothing's filled. Not exported to Godot, no `.tres` round-trip.
- **Pixel placeholders.** [client/src/PixelPlaceholder.tsx](client/src/PixelPlaceholder.tsx) exports four pixel-art SVG variants — `PortraitPlaceholder` (robot face, used for NPCs / quest givers), `IconPlaceholder` (crate, used for missing item / faction icons), `LogoPlaceholder` (geometric mark, used for the concept logo slot), `BannerPlaceholder` (landscape silhouette with sun/mountains/ground, used for faction banners and the concept splash hero). Single fill (`currentColor`) with varying opacity for shape definition; `shapeRendering="crispEdges"` so the rectangles render as pixels at any size. Sizing controlled by the consumer's className.
- **Context menu.** [client/src/ContextMenu.tsx](client/src/ContextMenu.tsx) replaces the browser's default menu globally. Two paths: (1) components own their target by wiring `onContextMenu` (`preventDefault` + `stopPropagation` + `showContextMenu({...})` with their own items — used by sequence nodes and the dialog canvas pane), or (2) the event bubbles to document and the host's default handler builds Cut / Copy / Paste based on selection + whether the target is editable. Cut/Copy/Paste use the modern Clipboard API with `execCommand` fallback; Paste in inputs goes through a native value setter so React's `onChange` fires (controlled components stay in sync). API mirrors Modal.tsx (imperative `showContextMenu` / `hideContextMenu` via a module singleton + pub/sub). Listeners use **capture phase** so handlers further down (notably React Flow's pane, which stops mousedown propagation for its pan/zoom) can't swallow them. When the cursor is in the bottom 30% of the viewport the menu anchors by its bottom edge (opens upward) so right-clicks near the bottom never produce a clipped menu, regardless of menu height.
- **Splash screen** ([client/src/SplashScreen.tsx](client/src/SplashScreen.tsx)) fires on every fresh mount of the app (i.e. real refresh / first load). Bleepforge logo + 3s pixel-themed loading bar. The current URL is preserved across the splash because the router doesn't re-mount — F5 on `/quests` goes splash → `/quests`. Clicking the `BLEEPFORGE` header label does `window.location.href = "/"`, which both reloads AND lands on `/concept`, so logo-click semantics are "refresh to home" rather than "navigate to home". Eventually replaced by Tauri's native splash for the desktop build; the React version stays as a fallback for web/dev sessions.
- **List-page card / list view pattern.** Items, Quests, NPCs, Karma impacts, and Factions all share the same shape: header row with count + view-mode toggle + New button, filter row (text search + domain-specific dropdowns + sort), then either a grid of cards (default — `grid-cols-1 sm:2 lg:3 xl:4`) or a vertical stack of compact rows. Grouping is preserved across both modes — Items by Category, Quests by giver, NPCs by model, Karma/Factions ungrouped. The toggle is `<ViewToggle>` from [client/src/ViewToggle.tsx](client/src/ViewToggle.tsx); it's a generic component — pass `options={CARDS_LIST_OPTIONS}` (cards/list icons) or `options={GRAPH_LIST_OPTIONS}` (graph/list icons, used by the dialog page). For the five card-domain pages, selection persists per-domain to `localStorage["bleepforge:viewMode:<domain>"]` via `useViewMode(domain)` and syncs across tabs. The dialog page derives its mode from the route (`/dialogs` = graph, `/dialogs/list` = list) so toggling navigates instead of writing localStorage; both routes preserve the active `?folder=` query.

  Cards live in `<domain>/<Domain>Card.tsx` and surface the most useful info at a glance: portrait/icon, title, id, line-clamped description, color-coded Badge components per type/category. Quest cards additionally show objective-type breakdown (`2× kill`, `1× collect`) and reward summary (`150c`, `⌹ 3`, `⚑ 2`), plus an auto-managed-flag strip at the bottom (`ActiveFlag` / `CompleteFlag` / `TurnedInFlag`) only when set. NPC cards have no description field (the schema dropped one), so they instead surface a references block — `dialog: <DefaultDialog>`, `offended: <OffendedDialog>`, `quests: <id1>, <id2>, +N`, `loot: <pickup1>, <pickup2>, +N`, `karma: <DeathImpactId> / <ContextualImpactId>`, `balloon: <CasualRemark basename>` — followed by a flag strip (`OffendedFlag` / `ContextualFlag` / `DidSpeakFlag`) matching QuestCard's pattern. Each domain also has a `<Domain>Row.tsx` that renders the same data on a single dense line, hiding softer columns at narrow viewports (`sm:` / `lg:` breakpoints).
- **Dialog source-type filter + folder dots.** [client/src/dialog/SourceFilter.tsx](client/src/dialog/SourceFilter.tsx) exports the `<SourceFilter>` segmented control (All / NPC / Terminal) and a `useDialogSourceFilter()` hook backed by `localStorage["bleepforge:dialogSourceFilter"]` so the active filter survives the graph ↔ list view toggle (otherwise toggling routes resets to "all"). Both the graph and list views render the same control + share the same hook, and both compute `visibleFolders` the same way — folders that contain at least one sequence matching the active filter are kept; folders unknown to the type index are kept too (a brief boot-window safety so content doesn't pop out). When the active folder is hidden by a filter change, both views auto-hop (`replace: true`) to the first visible folder. [client/src/dialog/FolderTabs.tsx](client/src/dialog/FolderTabs.tsx) accepts an optional `typesByFolder?: Map<string, DialogSourceType[]>` and renders a small 6px colored square per type inside each tab — orange (`source-npc`) when the folder contains NPC dialogs, green (`source-terminal`) when it has Terminal dialogs, both when mixed. The SourceFilter's NPC/Terminal buttons keep their color always-on (muted at rest, brighter when active) with three layered active cues — inset ring, brighter palette, and a 2px pixel offset shadow — so selection reads clearly without color being the only signal. The "All" button stays neutral. The graph view's per-node Terminal tinting (border, header pill, "TERMINAL" badge) also resolves through `--color-source-terminal-*` so the node mood matches the filter chrome.
- **Toast notifications.** [client/src/Toast.tsx](client/src/Toast.tsx) provides imperative `pushToast(opts)` / `dismissToast(id)` / `clearToasts()` APIs (mirrors Modal/ContextMenu's module-singleton + pub/sub bus pattern). `<ToastHost />` mounts once at App root. Toasts stack bottom-right, capped at 5 visible (oldest dropped beyond that), default 5s auto-close. Hover pauses the timer (`expiresAt` is pushed forward each animation frame the user is over the toast); the progress bar at the bottom freezes with it. The body is a click target (`<Link>` — navigates and dismisses); the corner × dismisses without navigating. Variants `success` / `info` / `warn` / `error` resolve to emerald / emerald / amber / red borders respectively, all theme-aware via the re-pointed Tailwind palette. Dedupe by `id` — passing the same id replaces an existing toast and resets its timer. **Sync → toast bridge** lives at [client/src/sync/syncToasts.ts](client/src/sync/syncToasts.ts): `useSyncToasts()` (mounted at App root) subscribes to `Bleepforge:sync` and pushes one toast per Godot save, deduped by `sync:<domain>:<key>:<action>`. Updated entities link to their edit form; deleted entities link to the domain list (or `/dialogs?folder=<folder>` for dialogs, since the graph already reads that param). The mapping is the only place that knows route shapes — keeps `Toast.tsx` domain-agnostic so other code can push toasts later.
- **Schemas mirror Godot resource fields 1:1** (PascalCase keys, same field names). Pays off for manual transcription today, and keeps `.tres` parsing viable later if needed. Note: Bleepforge writes string enums (`"Credits"`, `"QuestItem"`); existing `.tres` files use ints — irrelevant unless we ever sync.

## The Godot side (source of truth for the schema)

All authored content is `Resource` subclasses tagged `[GlobalClass]`, currently stored as `.tres`. Runtime singletons (`DialogRegistry`, `QuestManager`) load them. The editor only writes the **authored** types, never the runtime ones.

### Domain 1 — Dialogs

Loaded by `DialogRegistry` (autoload), which walks every folder in `DialogFolders.AllFolders` recursively, picks up every `.tres`, and indexes by `DialogSequence.Id`. **Duplicate `Id`s are an error.**

`DialogFolders.AllFolders` (from [shared/components/dialog/DialogFolders.cs](../Godot/astro-man/shared/components/dialog/DialogFolders.cs)) is **per-context**, scattered under per-NPC and per-interactible directories — not a single folder:

- `res://world/interactibles/standing_terminal/dialogs/welcome`
- `res://world/interactibles/standing_terminal/dialogs/cut_door_001`
- `res://characters/npcs/hap_500/dialogs/Eddie`
- `res://characters/npcs/sld_300/dialogs/Krang`
- `res://characters/npcs/sld_300/dialogs/Korjack`

Bleepforge mirrors this organization automatically: discovery groups every `DialogSequence` `.tres` by its parent-directory basename, so a new `characters/npcs/<some_robot>/dialogs/<Speaker>/` shows up as a fresh Bleepforge folder at next boot with zero code changes. Bleepforge's storage is per-folder under `dialoguer/data/dialogs/<folder>/`.

```text
DialogSequence
  Id          : string         // globally unique; registry key
  SourceType  : enum { Npc, Terminal }  // drives the source-type filter + node tinting
  Lines       : DialogLine[]
  SetsFlag    : string         // raised when sequence begins ("" = none)

DialogLine
  SpeakerName : string
  Text        : string         // multiline
  Portrait    : Texture2D      // → string resource path in JSON
  Choices     : DialogChoice[] // empty = no branch at this line

DialogChoice
  Text            : string
  NextSequenceId  : string     // FK → DialogSequence.Id ("" = ?)
  SetsFlag        : string     // raised when choice taken
```

**Branching model**: lines within a sequence are linear (no explicit "next line"); branching only happens between sequences via `Choice.NextSequenceId`. Natural editor shape: graph view of sequences, with each sequence's lines edited as an inner ordered list.

### Domain 2 — Quests

Loaded by `QuestManager`. Currently `_Ready()` hardcodes paths (`GD.Load<Quest>("res://...")`) — inconsistent with `DialogRegistry`'s folder-walk, but not the editor's problem.

```text
Quest
  Id             : string
  QuestGiverId   : string      // FK → NPC id (NPC schema TBD)
  Title          : string
  Description    : string      // multiline
  Objectives     : QuestObjective[]
  Rewards        : QuestReward[]
  ActiveFlag     : string      // auto-set by QuestManager on StartQuest
  CompleteFlag   : string      // auto-set when all objectives done
  TurnedInFlag   : string      // auto-set on TurnIn

QuestObjective
  Id             : string      // unique per-quest
  Description    : string      // multiline
  Type           : enum { CollectItem, ReachLocation, TalkToNpc, KillNpc, KillEnemyType }
  TargetItem     : ItemData    // → string item slug in JSON, used when Type=CollectItem
  TargetId       : string      // used when Type ∈ { ReachLocation, TalkToNpc, KillNpc }
  EnemyType      : string      // used when Type=KillEnemyType
  RequiredCount  : int         // default 1
  ConsumeOnTurnIn: bool        // default true

QuestReward
  Type           : enum { Item, Flag, Credits }
  Item           : ItemData    // → string item slug, used when Type=Item
  Quantity       : int         // used when Type=Item
  FlagName       : string      // used when Type=Flag
  CreditAmount   : int         // used when Type=Credits
```

Both `QuestObjective` and `QuestReward` are **discriminated unions in disguise**: which field matters depends on `Type`. Editor UX should switch fields based on type selection rather than show all of them.

### Domain 3 — Items

Loaded by `ItemDatabase` (autoload). Scans `res://shared/items/data/` recursively, picks up every `.tres` / `.res`, indexes by `ItemData.Slug`. **Empty slugs warn; duplicate slugs warn (first one wins).**

```text
ItemData
  Slug         : string                                          // globally unique; database key
  DisplayName  : string
  Description  : string  // multiline
  Icon         : Texture2D                                       // → string resource path in JSON
  IsStackable  : bool    // default true
  MaxStack     : int     // default 99
  Price        : int     // default 0
  Category     : enum { Misc, Weapon, QuestItem, Upgrade, Consumable }

QuestItemData : ItemData
  QuestId      : string  // FK → Quest.Id
  CanDrop      : bool    // default false
  // Constructor forces: IsStackable=false, Category=QuestItem, Price=0
```

**Polymorphism / discriminator**: `QuestItemData` inherits `ItemData`. In JSON we need a way to round-trip the class identity. `Category == QuestItem` is a sufficient discriminator (its constructor forces it; no plain `ItemData` should ever have that category). Recommend an explicit `"type"` field anyway for forward-compat as more subclasses appear.

### Domain 4 — Karma impacts

Loaded by `KarmaManager` (autoload). Scans `res://shared/components/karma/impacts` recursively, picks up every `.tres`, indexes by `KarmaImpact.Id`. Empty Ids warn.

```text
KarmaImpact
  Id          : string                                  // globally unique; registry key
  Description : string  // multiline
  Deltas      : KarmaDelta[]

KarmaDelta
  Faction     : enum { Scavengers, FreeRobots, RFF, Grove }
  Amount      : int     // applied to that faction's karma, clamped to [-50, +100]
```

Runtime-only (editor doesn't write): `KarmaTier` enum, `AppliedImpactRecord`, `KarmaManager`.

**Triggering**: karma impacts are applied from game code only — no authored cross-reference from dialogs/quests to `KarmaImpact.Id`. The editor authors `KarmaImpact` files in isolation; no impact-picker is needed in dialog choices or quest rewards.

### Domain 5 — Factions

Loaded by `FactionRegistry` (Node, scene-instantiated). Walks `res://shared/components/factions/` recursively, picks up every `.tres`, indexes by the `FactionData.Faction` enum value. The registry holds at most one entry per enum value; later wins on duplicates.

```text
FactionData
  Faction          : enum { Scavengers, FreeRobots, RFF, Grove }   // primary key (enum value)
  DisplayName      : string
  Icon             : Texture2D    // → string resource path in JSON (absolute)
  Banner           : Texture2D    // → string resource path in JSON (absolute)
  ShortDescription : string       // multiline
```

**Folder layout** (Godot side): one `.tres` per faction in its own subfolder — `shared/components/factions/<name>/<name>.tres` (e.g. `scavengers/scavengers.tres`, `free_robots/free_robots.tres`). The `Faction = N` line uses the C# enum int (Scavengers=0 omitted by Godot, FreeRobots=1, RFF=2, Grove=3); the importer maps int→enum string via `FACTION_BY_INDEX`.

**Robotek**: lore-only. The folder `shared/components/factions/robotek/` exists with art (PNGs) but **no `.tres`** — there's no enum entry. Treated as expected absence by the importer; it won't show as a skip or error.

**Bleepforge storage**: `data/factions/<Faction>.json` (one file per enum value: `Scavengers.json`, `FreeRobots.json`, `RFF.json`, `Grove.json`). The `.tres` write-back mapper reconciles `DisplayName`, `ShortDescription`, `Icon`, and `Banner`. Icon/Banner go through the shared `reconcileTextureField` helper, which swaps `Texture2D` ext_resources to whatever absolute path the JSON now holds (with UID looked up from the `.png.import` sidecar) and removes the property line + orphan ext_resource when JSON is cleared. The locator (`findFactionTres`) walks subfolders and matches `script_class="FactionData"` plus the `Faction = N` int.

### Domain 6 — NPCs

Loaded by Godot at runtime via `NpcData : Resource`. The NPC scene template (`Npc : CharacterBody2D`) holds an exported `NpcData` reference, so per-instance NPC identity is now an authored `.tres` rather than scene-only overrides — which is what made it tractable to author in Bleepforge. The previous lightweight stub (`Description`, `Portraits[]`, `Sprites[]`) was dropped in this refactor; their UI usage was minimal and the canonical Godot `Portrait` is more correct for the consumers (dialog graph speaker portrait, quest-card giver portrait).

```text
NpcData
  // Identity
  NpcId                  : string         // primary key
  DisplayName            : string
  MemoryEntryId          : string         // robot model — "hap_500", "sld_300"
  Portrait               : Texture2D      // → string absolute path in JSON

  // Dialog & Quests
  DefaultDialog          : DialogSequence  // → string DialogSequence.Id
  OffendedDialog         : DialogSequence  // → string DialogSequence.Id
  OffendedFlag           : string
  Quests                 : NpcQuestEntry[] // editable in Bleepforge

  // Karma
  DeathImpactId          : string         // KarmaImpact.Id
  DeathImpactIdContextual: string         // KarmaImpact.Id when ContextualFlag is set
  ContextualFlag         : string

  // Misc
  LootTable              : LootTable      // inline sub-resource — authored in Bleepforge
  CasualRemark           : BalloonLine    // → string res:// path (opaque)
  DidSpeakFlag           : string

NpcQuestEntry (sub-resource, editable in Bleepforge)
  QuestId                : string
  QuestActiveFlag        : string
  QuestTurnedInFlag      : string
  OfferDialog            : DialogSequence  // → string DialogSequence.Id
  AcceptedDialog         : DialogSequence
  InProgressDialog       : DialogSequence
  TurnInDialog           : DialogSequence
  PostQuestDialog        : DialogSequence

LootTable (inline sub-resource)
  Entries                : LootEntry[]

LootEntry (sub-resource)
  PickupScene            : PackedScene    // → string res:// path (opaque .tscn)
  Chance                 : float          // 0..1
  MinAmount              : int
  MaxAmount              : int
```

**Folder layout** (Godot side): `characters/npcs/<robot_model>/data/<npc_id>_npc_data.tres`. Multiple NPCs can share a robot model (e.g. Krang and Korjack both use `sld_300`). The importer walks `characters/npcs/` recursively but only picks up files inside a `data/` subfolder — Godot scenes (`.tscn`) and balloon/dialog `.tres` live elsewhere under that tree.

**Bleepforge storage**: `data/npcs/<NpcId>.json`.

**Write-back covers scalars + LootTable + Quests.** The writer reconciles 7 string fields (`DisplayName`, `MemoryEntryId`, `OffendedFlag`, `DeathImpactId`, `DeathImpactIdContextual`, `ContextualFlag`, `DidSpeakFlag`), the entire `LootTable` (handles all four cases: none → none / none → some / some → none / some → some — see `applyNpcLootTable` in [server/src/tres/domains/npc.ts](server/src/tres/domains/npc.ts)), and the `Quests[]` array of `NpcQuestEntry` sub-resources (`applyNpcQuests` in the same file — handles add / update / remove). Each entry's 5 dialog refs (`OfferDialog` / `AcceptedDialog` / `InProgressDialog` / `TurnInDialog` / `PostQuestDialog`) are resolved at save time: the writer pre-discovers all DialogSequence `.tres` paths via `discoverGodotContent`, then for each unique sequence Id used by the JSON it scans those candidates with a line-anchored `^Id = "<seq>"` regex (line anchor matters — a substring match would also hit `NextSequenceId = "<seq>"` on Choice rows and resolve to the wrong file). `QuestId` itself is a plain string, not an ext_resource, so we don't have to look up Quest `.tres` UIDs. The script ext_resource for `NpcQuestEntry.cs` is added on demand. Reference fields (`Portrait`, `DefaultDialog`, `OffendedDialog`, `CasualRemark`) are still left untouched — round-trip preserved but not authored yet. The locator (`findNpcTres`) walks `characters/npcs/<model>/data/` and matches `script_class="NpcData"` plus `NpcId = "<id>"`.

**Live-sync flow** (single-file watcher): when the NPC `.tres` is gone (e.g. delete), `detectDomain` tags it with the file basename. For the JSON cleanup heuristic, the watcher strips the `_npc_data` suffix from the basename to recover the NpcId — works for the current naming convention.

**`NpcQuestEntry` dialog refs** (5 per entry) are converted from ext-resource paths to DialogSequence Ids during import. The orchestrator builds a `path → Id` map during the dialog pass and passes it to the NPC pass. The single-file `reimportOne` watcher path uses a filename-as-Id heuristic (`<id>.tres → "<id>"`), since the .tres filename = DialogSequence.Id by convention in this corpus.

## Cross-cutting concerns

### Resource references → string IDs

C# uses direct `Resource` references for cross-type links. Bleepforge flattens these to strings (paths or IDs) for the JSON shape:

| C# field                   | What it points to | JSON representation               |
| -------------------------- | ----------------- | --------------------------------- |
| `DialogLine.Portrait`      | `Texture2D`       | string `res://...png` path        |
| `ItemData.Icon`            | `Texture2D`       | string `res://...png` path        |
| `QuestObjective.TargetItem`| `ItemData`        | string item slug                  |
| `QuestReward.Item`         | `ItemData`        | string item slug                  |
| `NpcQuestEntry.*Dialog`    | `DialogSequence`  | string `DialogSequence.Id`        |

For copy-paste fidelity, when you drop a JSON value back into Godot's inspector you'll need to translate strings back into the right Resource pick. `DialogChoice.NextSequenceId` is the easy case — already a string in C#.

**Reference cycle**: `QuestItemData.QuestId` points at quests, and quests point at items via `QuestObjective.TargetItem` / `QuestReward.Item`. Both are already-string fields, but the editor must allow forward references in either direction (don't require the target to exist at save time, validate at a separate "check integrity" step).

### Enum serialization

Several authored fields are C# enums: `ItemCategory`, `ObjectiveType`, `RewardType`, `Faction`. **Bleepforge's JSON serializes enums as their string name** (`"QuestItem"`, `"CollectItem"`, `"Scavengers"`) — readable in diffs, robust to reordering. Godot's `.tres` files use ints for the same fields; only relevant if we ever sync.

### ID namespaces (separate, must not collide within a namespace)

- **DialogSequence.Id** — global, unique across all sequences
- **Quest.Id** — global
- **QuestObjective.Id** — per-quest
- **Item slugs** — global; `ItemData.Slug`, validated by `ItemDatabase`
- **KarmaImpact.Id** — global; validated by `KarmaManager`
- **NPC ids** — referenced by `QuestGiverId` and by `TargetId` (when `Type=TalkToNpc`/`KillNpc`); schema TBD
- **Location ids** — referenced by `TargetId` when `Type=ReachLocation`; schema TBD
- **Enemy type strings** — referenced by `EnemyType` when `Type=KillEnemyType`; appears to be free-form strings

### Flag namespace

Flags are **free-form strings** — no schema, no declared registry. Used as boolean state across `NpcState` (seen referenced in `QuestManager`). Set by quest state transitions, dialog choices, dialog sequence entry, and quest rewards. The editor should at minimum offer autocomplete from flags seen elsewhere in the corpus.

## `.tres` write-back

Bleepforge can now write JSON edits back to `.tres` files. The mappers live in `server/src/tres/domains/{item,karma,dialog,quest}.ts`; the format library (parser, emitter, mutation helpers, ext-resource creation) is in [server/src/tres/](server/src/tres/). Each domain has a CLI canary that takes a slug/id (and optional JSON overrides), parses the matching `.tres`, applies the JSON, emits to `dialoguer/.tres-staging/`, and shows a unified diff:

- `pnpm --filter @bleepforge/server canary <slug>` — Item
- `pnpm --filter @bleepforge/server canary-karma <id>` — KarmaImpact
- `pnpm --filter @bleepforge/server canary-dialog <folder> <id>` — DialogSequence
- `pnpm --filter @bleepforge/server canary-quest <id>` — Quest

Plus `pnpm harness` walks every `.tres` in the project and confirms parser+emitter round-trip is byte-identical (currently 88/88).

**What's supported:**

- All scalar property types (string incl. multiline, int, bool, enum-as-int).
- Default-aware reconcile per field: insert when JSON is non-default and `.tres` omits it; update when both differ; remove when JSON is default and `.tres` has the line; no-op when matching.
- Position-based scalar reconcile through every nesting level (sequence → lines → choices, quest → objectives/rewards).
- Trailing structural add/remove of sub-resources (lines, choices, objectives, rewards) with orphan cleanup. Mints `Resource_<5alnum>` IDs in Godot's format.
- Ext-resource creation when JSON references something the file doesn't yet point at:
  - Item slugs (TargetItem / Reward.Item) — UID read from `<root>/shared/items/data/<slug>.tres` header.
  - Texture paths (DialogLine.Portrait, Item.Icon, Faction.Icon, Faction.Banner) — UID read from `<png>.import` sidecar via the shared [textureRef.ts](server/src/tres/textureRef.ts) helper. The helper preserves any existing `SubResource` (e.g. `AtlasTexture`) when JSON is empty — Bleepforge doesn't author atlases and shouldn't blow them away on save. When swapping an `AtlasTexture` SubResource for a Texture2D ExtResource, the orphaned AtlasTexture sub_resource is removed so the orphan-ext-resource pass can also clean up its `atlas` ref (the sprite sheet ext_resource).
  - Project scripts (DialogChoice.cs, QuestObjective.cs, QuestReward.cs, NpcQuestEntry.cs, LootTable.cs, LootEntry.cs) — UID found by scanning the project for any other `.tres` that already references the script.

**Reorder-safe via `_subId`:** every sub-resource-backed JSON entry (DialogLine, DialogChoice, KarmaDelta, QuestObjective, QuestReward) carries an optional `_subId` mirroring the Godot sub_resource id. The importer populates it; mappers use it for stable-identity matching across reorder, add, update, and remove. Existing JSON was migrated via `pnpm --filter @bleepforge/server migrate-subids` (idempotent). New entries authored in Bleepforge UI have no `_subId` until first save, when one is minted.

**Save-to-Godot wiring (always on):** the save endpoints — `PUT /api/items/:slug`, `/api/karma/:id`, `/api/quests/:id`, `/api/npcs/:id`, `/api/factions/:id`, `/api/dialogs/:folder/:id` — first write the JSON cache, then call the matching mapper to update the live `.tres` in `GODOT_PROJECT_ROOT`. Atomic write (temp file + rename). The save response shape is `{ entity, tresWrite }` where `tresWrite` is `{ attempted, ok, path, warnings, error }` — clients can ignore it for now (api.ts logs to console). Server logs every attempt. Since `GODOT_PROJECT_ROOT` is required at boot, `tresWrite.attempted` is effectively always `true` for game-domain saves.

**Boot-time cache reconcile (always on):** on every server start, after `app.listen` opens the port, the orchestrator runs once over the whole Godot project and rewrites every JSON in `data/<domain>/`. This catches any edits made in Godot while Bleepforge was off. Cheap (~60ms on the current ~90 .tres files), idempotent, runs before the live watcher starts so we don't double-process churn during startup. If reconcile fails (e.g. a parser regression on one file) the server logs the error and continues with whatever JSON is on disk — better degraded than down.

**Reconcile diagnostics surfaced in the UI.** The result of the boot reconcile (per-domain `{imported, skipped, errors}` counts plus the full `errorDetails`/`skippedDetails` lists) is stashed in [server/src/reconcile/router.ts](server/src/reconcile/router.ts) and served at `GET /api/reconcile/status`. The boot log widens whenever something's wrong (`items=6 (errors:1)` instead of `items=6`) and prints one line per skipped/errored file. The client surfaces this in the **Reconcile** tab of the [/diagnostics](client/src/diagnostics/DiagnosticsPage.tsx) page (per-domain breakdown + file paths + reasons), and the unified header diagnostics icon reflects the worst-of severity across both tabs. Mappers throw on malformed required fields (e.g. `Slug = ""` or `Id = ""`) so those land in the `errors` bucket with accurate messages instead of being mislabeled as "wrong script_class" skips — the orchestrator's existing `try/catch` routes throws to errors and the message comes through verbatim. Without this, a single broken file silently leaves one domain with stale JSON and the UI gives no signal — easy to miss in browser dev mode and much easier to miss once the app's wrapped in a desktop shell.

**Auto-discovery — no hardcoded subfolders.** [server/src/import/discover.ts](server/src/import/discover.ts) walks the Godot project once and buckets every `.tres` by what it is: `script_class` for `Quest` / `KarmaImpact` / `FactionData` / `NpcData` / `DialogSequence`, and `Slug = "..."` presence for items (so `MedkitData`, `WeaponData`, and any future `ItemData` subclass land in the items bucket without a code change). DialogSequence files are grouped by parent-dir basename, so `.../dialogs/Krang/foo.tres` becomes Bleepforge folder `"Krang"` automatically. The previous `KNOWN_DIALOG_FOLDERS` constant and the per-domain `*_GODOT_PATH` constants in the orchestrator are gone — adding a new NPC's dialog folder, or moving content under the project, just works at next boot. Reads the whole file (each is ~1KB; total ~90KB) instead of a header-bytes prefix because the cost is negligible and it removes any "did I read enough bytes for the marker to appear?" fragility.

**Live-sync from Godot (always on):** the server watches `GODOT_PROJECT_ROOT` via [chokidar](https://github.com/paulmillr/chokidar) (filtered to `.tres` and excluding the `.godot/` cache). On external change: re-imports that one file via the import mappers, overwrites the matching JSON in `data/`, and publishes a `SyncEvent` (`{ domain, key, action }`) on an in-memory bus. The SSE endpoint `GET /api/sync/events` streams those events to any open browser tab. The client opens an `EventSource` once at app boot ([client/src/sync/stream.ts](client/src/sync/stream.ts)), re-dispatches each event as a `Bleepforge:sync` window CustomEvent, and components register via `useSyncRefresh({ domain, key, onChange })` to refetch when their entity changes.

We use a 150 ms per-path debounce we control rather than chokidar's `awaitWriteFinish` — the latter has a stuck-state bug for atomic-rename saves where the new file ends up with the same byte size as the old one (the polling state machine waits forever for a stabilization that never comes). Symptom was reliable: a specific dialog would stop firing watcher events after a save or two and stay silent until the server restarted.

Self-write suppression in [server/src/tres/writer.ts](server/src/tres/writer.ts): every save records the path with a timestamp; the watcher skips events for paths within a 1.5 s window. Without this, a Bleepforge save would trigger our own watcher → re-import → emit event → client refetch (harmless but wasteful).

UI subscribers: every list/edit page wires `useSyncRefresh` for its domain (item, karma, quest, dialog), the dialog graph view subscribes for the active folder, `ItemIcon` re-fetches its descriptor on item events (so a Godot-side icon change shows up live), and `useCatalog` (autocomplete) bridges through the catalog-bus so it also refreshes on any sync event. NPCs are intentionally not subscribed — there's no `.tres` watcher fire for that domain. The same SSE stream also drives the toast notifications via `useSyncToasts` — see "Toast notifications" above for the click-to-navigate / dedupe / pause-on-hover behavior.

**Known limitations (deferred):**

- **Orphan ext-resources** are not cleaned up when their last reference is removed. Godot tolerates them; minor lint, not a correctness issue.
- **`load_steps` header attribute** isn't maintained (this corpus doesn't use it). If Godot starts emitting it on save, our writer will need to update it.
- **No `.tres` deletion** when JSON is deleted. The orphan stays in Godot; user removes manually if desired.
- **Concurrent edit conflict**: if Yonatan edits the same entity in Bleepforge and in Godot at the same time, the watcher's reimport silently overwrites the in-progress form data when the client refetches. Single-user local workflow makes this rare; future work could surface a "modified externally" banner.

## Open questions

**Schema:**

- Empty `DialogChoice.NextSequenceId` — end conversation, or fall through to next line?
- Conditions / flag *checks* — only `SetsFlag` is visible. Is there a `RequiresFlag` / `ShowIfFlag` mechanism elsewhere, or is gating not built yet?
- Mid-sequence choices — used in practice or only on last line?
- NPC schema — what file is authored, where do `QuestGiverId` and `TargetId` resolve to?
- Why does `NpcQuestEntry` duplicate `QuestActiveFlag` / `QuestTurnedInFlag` rather than reading them off the referenced `Quest`?
- ~~**`NpcQuestEntry` file model**~~ — resolved. They're an inline `Quests[]` sub_resource array on `NpcData`. Authored in the NPC edit form (QuestId + 2 flag fields + 5 dialog refs per entry); writeback handles add/update/remove via `applyNpcQuests`.
- ~~**Dialog folder path**~~ — resolved. Discovery walks the Godot project at boot and groups DialogSequence `.tres` by parent-dir basename, so the editor mirrors `DialogFolders.AllFolders` automatically.
- `KarmaTier` enum has 7 values but `GetTierForValue` only returns 5 (Liked/Idolized unreachable). Authored content doesn't care, but worth confirming this is a known WIP and not a bug we're modeling around.
- **`Faction` enum vs faction folder mismatch**: enum has 4 (Scavengers, FreeRobots, RFF, Grove); `shared/components/factions/` has 5 folders (the 4 above + `robotek/` with a `robotek.tres`). Either the enum is missing Robotek or robotek is unfinished. Editor's faction picker is currently the enum's 4.

**Editor scope / next steps:**

- ~~**Graph view of dialogs**~~ — done. The headline feature; pan/zoom, click-for-detail, dagre auto-layout, per-folder layout persistence, inline edge label editing, waypoint editing.
- ~~**Multi-folder dialog support**~~ — done. Auto-discovered from the Godot project at boot.
- ~~**Lightweight integrity check**~~ — done, and grew into the full `/diagnostics` page (Integrity + Reconcile + Logs + Process + Watcher tabs, unified header icon).
- ~~**NpcQuestEntry editor**~~ — done. The last "round-trip preserved but not authored" gap on the NPC form.
- ~~**Item.Icon / Faction.Icon + Banner writeback**~~ — done. Texture2D ext_resources update on save; AtlasTexture sub_resources are preserved when JSON Icon is empty.
- **Wrap with Electron** — the next session's task. See "Next big move" at the top.
- v1 polish on existing UIs (deferred — Yonatan: "we'll polish with time").

## Collaboration

Per Yonatan's global CLAUDE.md: docs are built together, I'm expected to have opinions and push back. This file evolves as we learn — not a static spec.
