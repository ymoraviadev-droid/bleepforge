# Bleepforge

**A graph-based project organizer / planning tool** for Yonatan's Godot game **Flock of Bleeps** (formerly placeholder "AstroMan" — the C# namespace and project folder still use the old name). Visualizes and documents **dialogues** (the headline feature: a graph view), plus **quests**, **items**, **karma impacts**, **NPCs**, **factions**, and **balloons** (the small "Hi there!" lines NPCs say when the player walks up). Also serves as the project bible — see [data/concept.json](data/concept.json) for the canonical pitch, acts structure, and faction roles.

**`.tres` is canonical, JSON in `data/` is a derived cache.** The Godot `.tres` files are what the game runtime loads, so they're the source of truth: anything that ships is what's in `astro-man/`. Bleepforge's JSON in `dialoguer/data/{dialogs,quests,items,karma,npcs,factions,balloons}/` is a cache rebuilt from `.tres` on every server start, kept in sync afterward by the live watcher, and pushed back to `.tres` on every save. We still commit the JSONs to git as a redundant safety net (so historical states are queryable from either side), but they should never be edited by hand — any drift gets reconciled away on the next boot. Three Bleepforge-only files are **not** part of the cache and are authoritative state: `data/concept.json`, `data/preferences.json`, and per-folder `data/dialogs/<folder>/_layout.json` (graph node positions and edge styles).

**Godot project on disk**: `/home/ymoravia/Data/Projects/Godot/astro-man/`. The project root is **required** — Bleepforge refuses to start without it (no project root → nothing to read or write, so we fail fast instead of presenting an empty UI). Resolution order at boot: `data/preferences.json#godotProjectRoot` (set in-app via Preferences) → `GODOT_PROJECT_ROOT` env var → fail. The env var is the bootstrap fallback for first run before preferences exist; once you save a path in Preferences, that takes priority. Changes to the saved value require a server restart (no hot-swap — the resolved value is captured once at module init). Defense in depth: the writer refuses any target outside the resolved root. The schema sections below mirror the Godot Resource fields 1:1 so the mappers can apply JSON edits to the corresponding `.tres` properties.

## Stack

- **Frontend**: React + TypeScript + Tailwind + Vite
- **Backend**: Express + TypeScript
- **Persistence**: `.tres` (canonical, in the Godot project) + JSON cache at `dialoguer/data/<domain>/<id>.json` (rebuilt on boot, kept live by the watcher)

## v1 plan (decided)

**Scope** — seven data domains (Godot-mirrored) plus a Bleepforge-only concept doc:

1. Dialogs (`DialogSequence` / `DialogLine` / `DialogChoice`) — **CRUD + interactive graph view + multi-folder implemented**
2. Quests (`Quest` / `QuestObjective` / `QuestReward`) — **implemented**
3. Items (`Item`, `Category="QuestItem"` discriminates `QuestItemData`) — **implemented**
4. Karma impacts (`KarmaImpact` / `KarmaDelta`) — **implemented**
5. NPCs (`NpcData` — full authoring; `LootTable` editor + `Quests[]` editor + `CasualRemarks[]` array editor implemented) — **implemented**
6. Factions (`FactionData`) — **implemented**
7. Balloons (`BalloonLine`) — **implemented**

Plus **Game concept** — a single Bleepforge-only doc (`data/concept.json`) used as the app homepage, *not* exported to Godot. Holds title, tagline, description, logo/icon/splash images, genre, setting, status, inspirations, notes. Covered in the "Architecture decisions" section below.

Plus **Assets gallery + image editor** — eighth Bleepforge surface, architecturally distinct from the seven data domains: there's no `.tres` source of truth and no authored schema, because the assets ARE the files on disk. Browses every image in the Godot project, surfaces "used by N" scene + resource references on first paint, ships an in-app editor (crop, bg removal, tint, flip, auto-trim, Magic crop) that writes PNG bytes back to the project, and is reused inside the AssetPicker so every image-field in the rest of the app gets the same Edit / Duplicate / Delete + Import + create-folder affordances. Covered in the "Assets gallery + image editor" section below.

**Graph view interactions:**

- **Drag nodes** to reposition — saved per-folder to `data/dialogs/<folder>/_layout.json` on drag-stop.
- **Per-choice outgoing handles**: every `DialogChoice` has its own source handle (a 10×10 filled `--color-choice-500` square on the right edge, vertically aligned to its choice row in the node body). Lines that have **no choices yet** keep a smaller dashed-outline placeholder handle (8×8, dashed `choice-700` border, neutral-900 fill) anchored to the line's text — this exists so the user can drag from a choice-less line to start a new choice. Edges encode `sourceHandle: "choice-<lineIdx>-<choiceIdx>"` for choice handles or `"line-<lineIdx>"` for placeholders; `onConnect` parses either format, extracting the line index, then appends a new choice to that line. Drag-to-empty and drag-to-existing-node both append (do not reroute) — that's the simplest mental model and matches the previous per-line behavior; reroute-on-drag would be a follow-up if it's wanted. **Choice color** comes from a new `--color-choice-*` CSS variable (defaults to amber, distinct from the emerald accent and the green Terminal wash) — re-pointed to orange in the amber theme so choice connectors stay separable from the active accent. Edges, edge arrowheads, the per-choice "→" glyph in the node body, and the choice-handle squares all resolve through the same variable so they read as a single visual category.
- **Dialog-text → choices separator**: every line block in the node body that has 1+ choices renders a thin top border on the choices `<ul>` (`border-t border-neutral-800/70 pt-1`) so the dialog text and its branching choices read as two grouped sections rather than one undifferentiated stack.
- **Source-type body atmosphere**: each sequence node body gets a per-source-type background overlay so Terminal vs NPC reads as *mood*, not just a marker. Terminal nodes get faint horizontal scanlines via `repeating-linear-gradient(to bottom, color-mix(in srgb, var(--color-source-terminal-300) 7%, transparent) 0 1px, transparent 1px 3px)` — CRT character on top of the existing `bg-source-terminal-950/20` wash. NPC nodes get a soft warm pool via `radial-gradient(ellipse at top, color-mix(in srgb, var(--color-source-npc-500) 8%, transparent) 0%, transparent 65%)` — overhead-light vibe. Both use `color-mix(in srgb, ..., transparent)` so the alpha lands cleanly against the theme's oklch palette without manual rgba conversion; theme swaps retint automatically since they share the same source-type variables the rest of the UI uses.
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
- **Active-folder memory**: the active folder is in the URL via `?folder=Eddie` (clicking a tab updates the URL via `<Link>`) — that's the source of truth for back/forward and bookmarks. To bridge full leave-and-return when the user enters `/dialogs` with a *naked* URL (header nav, refresh of bookmark without param, etc.), the active folder is also written to `localStorage["bleepforge:lastDialogFolder"]` on every change; on entry without `?folder=` the saved value is restored via `setSearchParams({ folder: saved }, { replace: true })`. URL stays canonical; storage just rehydrates when the URL is missing the param. Combined with the per-folder viewport persistence above, returning to `/dialogs` from anywhere in the app lands you on the same folder *and* the same zoom/pan you left.

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
- ~~**`BalloonLine` authoring**~~ — done. Full domain with cards/list page, by-NPC + by-model filters, group-by selector, speech-balloon-styled cards. `NpcData.CasualRemarks` is now a real picker with autocomplete + reorder.
- **`Pickup` (collectible scene) authoring**. We surface a read-only catalog of `.tscn` files for the LootTable picker (see "Pickups" below) but don't author the scenes themselves — sprite/collision/animation work needs Godot's scene editor.
- **Auto-import (Godot → Bleepforge)**: wired on two timescales — boot-time reconcile rebuilds the whole JSON cache from `.tres` whenever the server starts, and the live watcher reimports individual files on every Godot save while running. There used to be a manual "rebuild now" button in Preferences; it was removed once the automatic paths were trustworthy. To force a rebuild, restart the server.

**Next big move: wrap with Electron.** The feature set feels finished — seven authored data domains all fully editable, two-way `.tres` sync solid, the diagnostics surface covers integrity / reconcile / logs / saves / process / watcher, and the assets gallery + image editor (Phases 1 + 3) ship a complete browse + Edit / Duplicate / Delete + Importer surface with crop, bg removal, tint, flip, auto-trim, and Magic crop subject detection. Wrapping in Electron is the "1.0 desktop" moment. Rationale (vs Tauri): Electron's main process *is* Node, so Express boots in-process via a plain `require` — no sidecar, no Rust. Hot reload preserved (Vite HMR works in the desktop window same as the browser). SSE works unchanged. Once the terminal goes away inside a packaged binary, the diagnostics work pays off — that's why it shipped first.

**Architecture decisions:**

- **Monorepo with workspaces** (pnpm): `client/` (React + TS + Tailwind + Vite), `server/` (Express + TS), `shared/` (TS types + zod schemas — single source of truth for JSON shapes, imported by both sides).
- **Storage**: `dialoguer/data/<domain>/<id>.json`. Configurable via `DATA_ROOT` env (default: `data` relative to the Bleepforge project root).
- **One file per entity** — clean diffs, easy to inspect.
- **Local-only, no auth, no deploy.** Express on localhost, Vite dev server proxies `/api`. Single user.
- **Validation** via zod schemas in `shared/`, applied at the server boundary on read and write.
- **CRUD is generic for flat domains.** [server/src/lib/util/jsonCrud.ts](server/src/lib/util/jsonCrud.ts) provides `makeJsonStorage(schema, folder, keyField)` and `makeCrudRouter(schema, storage, keyField, afterWrite, domain)`. Quests, Items, Karma, NPCs, and Factions use it. **Dialogs and Balloons are folder-aware** — files live at `data/dialogs/<folder>/<id>.json` and `data/balloons/<model>/<basename>.json` respectively, where folders are speaker contexts for dialogs (`Eddie`, `Krang`, etc., mirroring Godot's `DialogFolders.cs`) and NPC robot models for balloons (`hap_500`, `sld_300`, mirroring `characters/npcs/<model>/balloons/`). Folder + id are validated against `/^[a-zA-Z0-9_-]+$/` at the storage boundary. The `domain` arg on `makeCrudRouter` exists so the PUT handler can record the save into the Diagnostics → Saves activity feed.
- **Live image serving.** [server/src/lib/asset/router.ts](server/src/lib/asset/router.ts) exposes `GET /api/asset?path=<absolute>` to serve any image under `ASSET_ROOT` (defaults to `$HOME`) and `GET /api/asset/browse?dir=<path>` to list a directory (dirs + image files only). Used by NPC portraits/sprites, Item icons, DialogLine portraits, and the file-picker modal. `Cache-Control: no-cache` so file edits show immediately. Path traversal blocked by `path.relative` check.
- **File picker UX.** Browsers can't read absolute filesystem paths from `<input type="file">` (security), so Bleepforge ships its own [AssetPicker](client/src/components/AssetPicker.tsx) — a server-mediated modal that lets you click through `ASSET_ROOT`, see image thumbnails inline, and pick a file. The picker is used wherever an image path is authored.
- **Catalog + autocomplete.** [useCatalog](client/src/lib/useCatalog.ts) loads all NPCs/items/quests/factions/dialog sequences/balloons plus a derived flag set (every `SetsFlag` / quest flag value seen in the corpus). It also exposes `catalog.balloonRefs` (a flat list of `<model>/<basename>` ids for the NPC CasualRemarks picker). [CatalogDatalists](client/src/components/CatalogDatalists.tsx) mounts once at the App root and emits `<datalist>` elements (`DL.npcIds`, `DL.npcNames`, `DL.itemSlugs`, `DL.questIds`, `DL.sequenceIds`, `DL.flags`, `DL.factions`, `DL.balloonIds` — the balloon list shows the balloon's actual `Text` as the option label so picking by content works as well as picking by id). Forms wire FK inputs to the appropriate datalist via `list={DL.X}`. The catalog refreshes automatically after every save/remove via a tiny pub/sub bus ([catalog-bus.ts](client/src/lib/catalog-bus.ts)) hooked into the api wrappers.
- **Diagnostics page.** Unified diagnostic surface at [/diagnostics](client/src/features/diagnostics/DiagnosticsPage.tsx) — replaces what used to be two standalone pages (`/integrity` and `/reconcile`). Six tabs: **Integrity** (authored content — dangling FKs, duplicate ids, the checks `computeIssues` has always run), **Reconcile** (boot-time `.tres` → JSON cache rebuild), **Logs** (server-side log buffer), **Saves** (live save-activity feed, both directions), **Process** (server identity / uptime / config), **Watcher** (chokidar status + recent events). Each tab below has its own bullet. The header carries a single icon-only entry on the right side, next to the gear (both are *meta* actions about the app, not the project content) — pixel-art pulse waveform [DiagnosticsIcon](client/src/features/diagnostics/DiagnosticsIcon.tsx), stroke color shifts with severity (red error, amber warning, neutral when clean), small square numeric badge anchored to the icon's top-right corner when there's a count. Severity is the worst-of across the *severity-bearing* tabs (Integrity, Reconcile, Logs); Saves, Process, and Watcher are informational and never bump the badge — failures that matter already surface elsewhere, double-counting would be noise. Hitting `/diagnostics` with no sub-route auto-routes to the dirtiest tab so a broken state surfaces immediately; `/integrity`, `/reconcile`, and the legacy `/health` paths all redirect to `/diagnostics/<tab>` for back-compat. The aggregate severity logic lives in [useDiagnostics](client/src/features/diagnostics/useDiagnostics.ts), shared between the page and the App-level header icon. Authored-data check (`computeIssues`) stays in [client/src/lib/integrity/issues.ts](client/src/lib/integrity/issues.ts) — pure, no UI imports — so both the tab and the hook can run it without coupling.

- **Logs tab.** Captures server-side `console.{log,info,warn,error}` into a 1000-entry ring buffer at [server/src/lib/logs/buffer.ts](server/src/lib/logs/buffer.ts) (monkey-patches console at module load — must be the first import in [server/src/index.ts](server/src/index.ts) so boot lines get captured). Buffer is exposed at `GET /api/logs`; `POST /api/logs/clear` wipes it (used by the Logs tab's "Clear" button for "give me a clean slate before reproducing a bug"). The [LogsTab](client/src/features/diagnostics/LogsTab.tsx) view renders newest-first with a 3-way filter — `All` / `Good` (info only) / `Bad` (warning + error) — and Refresh + Clear buttons. On first open, if the buffer contains any error/warning entries the filter defaults to `Bad` so the user lands on the relevant lines instead of scrolling. Boot-reconcile per-file errors flow through `console.error` (and skips through `console.warn`) so they tag correctly in the buffer; the same root cause is intentionally double-counted across the Reconcile and Logs tabs because the user's path to fix it is different in each case. **No SSE streaming yet** — fetch-on-demand only. New errors after page load don't update the header icon until the user reloads. SSE + virtualized live feed would be a substantial next step; the current shape captures the core value (history + filter) at a fraction of the cost.

- **Saves tab.** Live activity feed of every save flowing through Bleepforge at [/diagnostics/saves](client/src/features/diagnostics/SavesTab.tsx). Two flows in one feed: **outgoing** (Bleepforge → Godot writeback — every PUT that touches a `.tres`) and **incoming** (Godot → Bleepforge reimport — watcher caught a `.tres` change). Server-side ring buffer (500 entries, larger than Logs/Watcher because saves are the highest-frequency signal during active editing) at [server/src/lib/saves/buffer.ts](server/src/lib/saves/buffer.ts); `recordSave` both appends to the buffer and publishes on a separate event bus. `GET /api/saves` returns the snapshot (newest-first); `POST /api/saves/clear` wipes it. Unlike the Logs tab, this one is **live-pushed via SSE** at `GET /api/saves/events` — the client opens an `EventSource` at boot ([client/src/lib/saves/stream.ts](client/src/lib/saves/stream.ts)) and dispatches each event as a `Bleepforge:save` window CustomEvent so the tab UI prepends new rows without a refresh. Each row carries timestamp + direction badge (← OUT / → IN) + domain + outcome (`ok` / `warning` / `error`) + clickable key linking to the source edit page; warnings + error messages expand inline below the row. Filter chips (All / Outgoing / Incoming), Refresh, and Clear in the header. The bus is intentionally separate from the SyncEvent bus (which drives toasts) — saves cover both directions, sync only the incoming reimports, and outgoing user-triggered saves shouldn't toast (would be redundant noise about an action they just took). Informational-only — failed writes already hit the Logs tab via `console.error` capture, so contributing here would double-count.

- **Process tab.** Read-only "what is the running server" view at [/diagnostics/process](client/src/features/diagnostics/ProcessTab.tsx). Reports Bleepforge version, Node version, platform, PID, port, start time + formatted uptime, data root, asset root, and the resolved Godot project root + source. Common debugging path: "wait, is this server actually using the project I think it is?" — happens after editing prefs and forgetting to restart, or when running multiple checkouts. `GET /api/process` returns a one-shot snapshot; the tab has a Refresh button so uptime can be re-checked without leaving the page. Intentionally informational — never bumps the header diagnostics icon.

- **Watcher tab.** chokidar status + recent-events feed at [/diagnostics/watcher](client/src/features/diagnostics/WatcherTab.tsx). Answers "is the watcher firing when I save in Godot?" without forcing the user to dig through the Logs tab. The watcher records every debounced event (kind + path + outcome) into a 100-entry ring inside [server/src/internal/tres/watcher.ts](server/src/internal/tres/watcher.ts); outcomes cover the full happy and ignored paths — `reimported`, `deleted`, `ignored-self-write`, `ignored-not-domain`, `failed`. `GET /api/watcher` returns `{ active, root, watchedFileCount, recentEvents }`. Like the Process tab, this one's informational and doesn't affect header severity — failed reimports already surface via Logs (`console.error` capture), so double-counting them in the badge would just be noise.
- **Reusable modal.** [Modal.tsx](client/src/components/Modal.tsx) provides `showConfirm(opts)` and `showPrompt(opts)` imperative APIs that return Promises (no `useState` boilerplate at call sites). `ModalHost` is mounted once at the App root and reads from a module-level singleton + pub/sub bus. Used everywhere a confirm or prompt is needed (delete confirmations, graph reset-layout, drag-to-empty new-sequence prompt with validation, etc.). All native `window.confirm` / `window.prompt` calls have been removed. Pixel-themed styling matches the rest of the UI.
- **Back navigation.** Every Edit page (`/items/:slug`, `/quests/:id`, `/npcs/:npcId`, `/karma/:id`, `/dialogs/:folder/:id`, `/balloons/:folder/:basename`, `/factions/:faction`) renders a `← Back to <list>` link at the top. The Dialog Edit's back link preserves the folder query param so you return to the correct graph.
- **Preferences page.** [/preferences](client/src/features/preferences/PreferencesPage.tsx), reached via the pixel gear icon in the header (replaced the always-visible theme swatch row). Four sections: Godot project, Global theme, Color theme, Typography — all persisted to `data/preferences.json`. The Godot-project section holds the project root override (text input + live validation against [/api/godot-project/validate](server/src/lib/godotProject/router.ts) which checks for `project.godot`); a "Restart server to apply" amber notice appears whenever the saved path differs from the running server's effective root, since config is captured once at boot and not hot-swapped. The old `/import` route still redirects here for back-compat; the import-from-Godot section that used to live here is gone (boot-time reconcile + live watcher cover it automatically).
- **Theming.** Every theme is a CSS-only override on `[data-theme="X"]` of `<html>`, defined in [client/src/styles/index.css](client/src/styles/index.css). Each block re-points the accent (`--color-emerald-*`) to a different Tailwind palette and re-tints the neutral scale toward the same hue with low chroma. Canvas tones (`--canvas-bg`, `--canvas-pattern`) are set per theme — invariant: canvas is always slightly darker than the page bg so the React Flow stage reads as recessed. Themes: dark, light, red, amber, green, cyan, blue, magenta. [client/src/styles/Theme.tsx](client/src/styles/Theme.tsx) holds the registry + `useTheme` hook + early-applies the saved theme to avoid flash. [client/src/styles/themeColors.ts](client/src/styles/themeColors.ts) exposes `useThemeColors()` to JS that needs the live computed values (SVG strokes, marker fills inside React Flow that can't be Tailwind classes). The base `@theme` block also defines three extra palettes — `--color-source-npc-*` (warm/orangish, defaults to amber) and `--color-source-terminal-*` (cool/greenish, defaults to green) for dialog SourceType color coding, and `--color-choice-*` (defaults to amber) for the dialog graph's per-choice handles, edges, and "→" glyphs. The `amber` theme overrides both `source-npc` and `choice` to point at orange so they stay distinct from the active accent; other themes keep the defaults.
- **Typography knobs.** [client/src/styles/Font.tsx](client/src/styles/Font.tsx) is the DOM-applier for body font (8 pixel families, native `<select>` with each option styled in its own family), UI scale (`--text-scale` on `:root`, drives `html { font-size }` so `rem`-based padding scales with text — true UI zoom, not text-only resize), and letter spacing (`--body-letter-spacing` on `<body>`, mono keeps its hard 0 override). Display font (Press Start 2P) and mono (VT323) stay fixed. The 7 added body fonts beyond Pixelify Sans: Silkscreen, Jersey 10, Tiny5, DotGothic16, Handjet, Workbench, Sixtyfour — all on Google Fonts so no additional infra. Persistence flows through [GlobalTheme](client/src/styles/GlobalTheme.tsx) (see "Global themes" below) — Font.tsx exposes setters and getters but no longer owns the storage.
- **Global themes.** Color theme + body font + UI scale + letter spacing are bundled into a named "global theme". Users can save the current values as a new theme via Preferences and switch between them; the active theme is reapplied each session. Schema in [shared/src/preferences.ts](shared/src/preferences.ts) (plain string ids for color/font, validated client-side at apply-time so the canonical metadata stays alongside the React UI). Server: singleton router at `/api/preferences` (GET + PUT, mirrors `/api/concept`); file at [data/preferences.json](data/preferences.json). Client: [client/src/styles/GlobalTheme.tsx](client/src/styles/GlobalTheme.tsx) holds state + pub/sub + wrapped setters that apply DOM via Theme/Font and persist into the active theme record. Boot is two-phase — synchronous read from a localStorage cache (`bleepforge:globalThemesCache`) for instant paint, then async fetch from the server reconciles. The "default" theme is built-in, always present, and can't be deleted (it's the safety fallback). Tauri-friendly: same fetch pattern works in the desktop webview, and the localStorage cache means the app paints correctly even before the server fetch resolves.
- **Themed scrollbars.** Track + thumb resolve through `--color-neutral-*` so they re-tint per theme (light themes get a darker thumb on a lighter bg, dark themes the inverse — both directions land naturally). Hover/active uses the accent so grabbing the bar gives a theme-colored "lit up" cue. Webkit pseudos for the hover state, `scrollbar-color` for Firefox.
- **Pixel slider.** [PixelSlider](client/src/components/PixelSlider.tsx) wraps `<input type="range">` and computes a `--pct` CSS variable inline so the styling can clip the chunked fill at the right point. Style block lives in [client/src/styles/index.css](client/src/styles/index.css) next to the scrollbar pseudos. Track is squared (no border radius — project-wide convention) with a 2px outer border + inset shadow so it reads as recessed. Fill is 5 emerald chunks brightening 700 → 300 left-to-right, separated by 0.4% transparent gaps at the color transitions — gives the segmented pixel-progress-bar feel. The chunks are anchored to the track and revealed left-to-right by a second linear-gradient that masks everything past `--pct` with the track bg, rather than stretching with value (which is what `::-moz-range-progress` would do — we override that to transparent for parity with the webkit track). Thumb is 18×22 with a pixel-bevel via inset box-shadows (light top+left, dark bottom+right) plus an outer dark ring; hover/active brighten it. Theme-aware through `--color-emerald-*` and `--color-neutral-*`. First user is the Preferences → Typography sliders (UI scale + letter spacing); reusable anywhere a slider is needed.
- **SliderField.** [SliderField](client/src/components/SliderField.tsx) is the form-field wrapper around `<PixelSlider>` — label-left + right-aligned value display + slider + optional hint, with a `format` callback for unit suffixes (`"30 cps"`, `"2.0s"`, `"+15"`, `"instant"`). Used for in-form numeric properties with natural bounds: NPC LootEntry Chance / Min / Max (the loot entry layout was restructured at the same time — pickup picker + Remove on top, then 3 sliders side-by-side below in a 3-col grid, since the old 12-col cramped row didn't give sliders enough horizontal room), KarmaDelta.Amount (signed display, range −50 to +100 matching the runtime clamp), and Balloon TypeSpeed (0–100 cps) / HoldDuration (0–10s). Intentionally **not** used for fields without natural caps — Item Price (free-form), Quest CreditAmount / Quantity / RequiredCount (any int), and Item MaxStack (the wild has `MaxStack = 10000000000` for stack-always items, which a finite-cap slider would silently clip). The PreferencesPage `RangeField` predates SliderField and stays separate because it carries a per-field "reset to default" link that's specific to the prefs UX; functionally similar but not worth folding together.
- **Pickups (collectible scenes)** are a read-only catalog Bleepforge surfaces for the NPC LootTable picker. [server/src/lib/pickup/router.ts](server/src/lib/pickup/router.ts) walks `world/collectibles/<name>/<name>.tscn` in the Godot project and parses each scene's `[gd_scene]` UID + the root node's `DbItemName` property. Served at `GET /api/pickups`, cached 30s. The integrity check flags any `LootEntry.PickupScene` whose path doesn't match a current pickup so Godot-side `.tscn` renames don't ship as silent breakage.
- **Typed-array literal output.** `serializeSubRefArray` + `reconcileSubResourceArray` accept an optional `typedArrayExtId`, emitting the property as `Array[ExtResource("<id>")]([SubResource(...)])` — required for C# fields declared as `Godot.Collections.Array<T>` (e.g. `NpcData.LootTable.Entries`). Plain `T[]` C# arrays (e.g. `KarmaImpact.Deltas`) leave it unset and get the bare-array form.
- **Orphan ext_resource cleanup.** Final post-pass in `runWrite` ([server/src/internal/tres/writer.ts](server/src/internal/tres/writer.ts)) walks the doc and drops any `[ext_resource]` whose id has zero `ExtResource("<id>")` occurrences in property values across all sections. Catches orphans introduced by the apply (e.g. swapping a LootEntry's PickupScene leaves the prior PackedScene ref unused) plus any pre-existing orphans. Conservative — only removes when the id literally never appears outside its own definition. `metadata/_custom_type_script` uses raw `uid://...` strings (not ExtResource refs) so it's correctly NOT counted as a usage. Removed ids are surfaced as a warning per save.
- **Game concept page** is the app homepage. Two routes mirroring the items / quests pattern: `/concept` shows [ConceptView](client/src/features/concept/View.tsx) (read-only homepage with hero block — splash image, logo, icon, title, tagline, meta row, long-form sections), `/concept/edit` shows [ConceptEdit](client/src/features/concept/Edit.tsx) (the form). `/` redirects to `/concept`. Single Bleepforge-only document at [data/concept.json](data/concept.json), served via a singleton router at `/api/concept` (GET + PUT, no list, no domain CRUD machinery). Schema in [shared/src/concept.ts](shared/src/concept.ts). All fields optional — missing images fall back to [PixelPlaceholder](client/src/components/PixelPlaceholder.tsx) variants so the layout has presence even when nothing's filled. Not exported to Godot, no `.tres` round-trip.
- **Pixel placeholders.** [client/src/components/PixelPlaceholder.tsx](client/src/components/PixelPlaceholder.tsx) exports four pixel-art SVG variants — `PortraitPlaceholder` (robot face, used for NPCs / quest givers), `IconPlaceholder` (crate, used for missing item / faction icons), `LogoPlaceholder` (geometric mark, used for the concept logo slot), `BannerPlaceholder` (landscape silhouette with sun/mountains/ground, used for faction banners and the concept splash hero). Single fill (`currentColor`) with varying opacity for shape definition; `shapeRendering="crispEdges"` so the rectangles render as pixels at any size. Sizing controlled by the consumer's className.
- **Empty states.** [EmptyState](client/src/components/EmptyState.tsx) — reusable list-page empty state: pixel-art illustration slot + uppercase display-font title + body + optional CTA (renders `Button` for `onClick`, `ButtonLink` for `href`). Four 48×32 illustrations co-located in the same file: `WorkshopEmpty` (items, factions), `NoticeboardEmpty` (quests), `TerminalSilent` (balloons; available for dialogs/list mode if we want it later), `BunkerEmpty` (NPCs, karma). Same conventions as `PixelPlaceholder.tsx` (single `currentColor` fill, opacity-for-shape, `crispEdges`). Used wherever a list page has zero entries; the **filter-empty** case (entries exist but filters reduce to 0) intentionally keeps the existing one-line `<p>` text — a big illustration would suggest the data is gone when it's just hidden.
- **Error boundary.** [ErrorBoundary](client/src/components/ErrorBoundary.tsx) — class component wrapping the entire `Routes` block in [App.tsx](client/src/App.tsx). Catches render errors anywhere in the page subtree before React unmounts the shell to a white screen. Shows a 24×24 `BrokenRobot` SVG (X eyes, snapped antenna, sparks, smoke wisps) tinted via `text-red-400/80` on the parent, the error message in a red-bordered code block, and three actions: **Reload page** (full `window.location.reload()`), **Go home** (resets the boundary state via `setState({ error: null })` and navigates to `/concept`), **Copy error** (clipboard API with silent fallback — the details are also visible in the `<details>` block below either way). Stack trace + component stack are collapsed in `<details>` so most users don't see them but devs can expand. Logs the error to `console.error` so the Diagnostics → Logs tab catches it via the server-side console interception (relayed if the server made a round-trip; client-only errors won't appear there but the local devtools console always has it). App-level only — per-route boundaries are a later refinement if a single page error keeps blowing up the whole shell.
- **404 page.** [NotFoundPage](client/src/components/NotFoundPage.tsx) — catch-all `<Route path="*">` at the end of the route block in [App.tsx](client/src/App.tsx). Big "404" rendered in the display font (`Press Start 2P`) + a 24×24 `LostSignal` SVG (robot face with hollow O eyes, intact antenna with broken signal arcs above, a stray "?" pixel-mark beside the antenna) + three navigation links: Go home, Open dialog graph, Diagnostics, so the user always lands somewhere useful. Visually distinct from `BrokenRobot` — that one is *broken* (red, sparks, X eyes — needs a reload), this one is *confused* (neutral tone, intact antenna, hollow eyes — needs a redirect). Two trigger paths: (1) the URL doesn't match any route (handled by the catch-all); (2) the URL *does* match a route but the entity inside doesn't exist — `/npcs/eddieioiu` matches `/npcs/:npcId` so React Router happily mounts `NpcEdit`, but the API returns null. Each of the seven entity-edit pages (npc, item, quest, karma, balloon, dialog, faction) maps the "fetched null" case to `setError("not found")` and renders `<NotFoundPage />` directly when that sentinel is set, *before* falling through to the inline red error text. Real fetch errors (network down, malformed response) still take the inline path — those aren't "page doesn't exist," they're "something is actually wrong."
- **/boom Easter egg.** [App.tsx](client/src/App.tsx) registers a `<Route path="/boom">` that mounts a tiny `Boom` component which throws synchronously during render — trips the ErrorBoundary every time. Kept as a manual-test hook for the boundary's fallback UI (and because it's funny). React error boundaries only catch render-phase errors, lifecycle errors, and constructor errors — not event handlers, async/promise rejections, or errors in the boundary itself — so a synchronous render throw is the right shape for testing.
- **Context menu.** [client/src/components/ContextMenu.tsx](client/src/components/ContextMenu.tsx) replaces the browser's default menu globally. Two paths: (1) components own their target by wiring `onContextMenu` (`preventDefault` + `stopPropagation` + `showContextMenu({...})` with their own items — used by sequence nodes and the dialog canvas pane), or (2) the event bubbles to document and the host's default handler builds Cut / Copy / Paste based on selection + whether the target is editable. Cut/Copy/Paste use the modern Clipboard API with `execCommand` fallback; Paste in inputs goes through a native value setter so React's `onChange` fires (controlled components stay in sync). API mirrors Modal.tsx (imperative `showContextMenu` / `hideContextMenu` via a module singleton + pub/sub). Listeners use **capture phase** so handlers further down (notably React Flow's pane, which stops mousedown propagation for its pan/zoom) can't swallow them. When the cursor is in the bottom 30% of the viewport the menu anchors by its bottom edge (opens upward) so right-clicks near the bottom never produce a clipped menu, regardless of menu height.
- **Splash screen** ([client/src/components/SplashScreen.tsx](client/src/components/SplashScreen.tsx)) fires on every fresh mount of the app (i.e. real refresh / first load). Bleepforge logo + 3s pixel-themed loading bar. The current URL is preserved across the splash because the router doesn't re-mount — F5 on `/quests` goes splash → `/quests`. Clicking the `BLEEPFORGE` header label does `window.location.href = "/"`, which both reloads AND lands on `/concept`, so logo-click semantics are "refresh to home" rather than "navigate to home". Boot-line flavor: a 15-entry list (`POLISHING BLEEPS...`, `CALIBRATING SCAVENGERS...`, `WINDING THE GROVE...`, etc.) cycles every 700ms with a random starting index — at the default 2s splash that's ~3 lines per session, and reloads almost always start on a different line so the rotation feels fresh. The same `<CreditLine>` rendered by the footer is pinned to the splash's bottom 6, so the authorship attribution greets you at both ends of the session. Eventually replaced by Tauri's native splash for the desktop build; the React version stays as a fallback for web/dev sessions.
- **Footer.** [Footer](client/src/components/Footer.tsx) — app-level footer with the authorship credit (*Authored by Yehonatan Moravia & Archie □ `ymoravia.dev@gmail.com`*; the email is a `mailto:` link). Both halves of the credit use the same body font at the same `text-[10px]` so they read as a single line — earlier attempts to keep the email in the mono font failed because VT323 has a smaller optical x-height than Pixelify Sans, so equal pixel sizes don't render at equal apparent size. The `□` separator is **not** an HTML entity but a CSS-rendered 6×6 `<span>` (`size-1.5 bg-neutral-500`) so it's pixel-perfect and theme-neutral; the original middot rendered too small at the prose font-size and was font-dependent. The wrapper component `<CreditLine>` is exported separately so the splash can render the same credit without inheriting the footer chrome (border, padding). Layout in [App.tsx](client/src/App.tsx): `<main>` is `flex flex-col`; the route content is wrapped in a `flex-1 px-6 py-6` div; the footer sits after, inside the `<ErrorBoundary>` so an error swap replaces the footer too (the broken-robot screen has its own actions, footer chrome below would be redundant). On short pages the `flex-1` wrapper pushes the footer to the viewport bottom; on long pages the footer scrolls into view at the end. Never occludes content — that's why we picked in-flow over `position: sticky`.
- **List-page card / list view pattern.** Items, Quests, NPCs, Karma impacts, Factions, and Balloons all share the same shape: header row with count + view-mode toggle + New button, filter row (text search + domain-specific dropdowns + sort), then either a grid of cards (default — `grid-cols-1 sm:2 lg:3 xl:4`) or a vertical stack of compact rows. Grouping is preserved across both modes — Items by Category, Quests by giver, NPCs by model, Balloons by configurable group-by (model / npc / none, default model), Karma/Factions ungrouped. The toggle is `<ViewToggle>` from [client/src/components/ViewToggle.tsx](client/src/components/ViewToggle.tsx); it's a generic component — pass `options={CARDS_LIST_OPTIONS}` (cards/list icons) or `options={GRAPH_LIST_OPTIONS}` (graph/list icons, used by the dialog page). For the six card-domain pages, selection persists per-domain to `localStorage["bleepforge:viewMode:<domain>"]` via `useViewMode(domain)` and syncs across tabs. The dialog page derives its mode from the route (`/dialogs` = graph, `/dialogs/list` = list) so toggling navigates instead of writing localStorage; both routes preserve the active `?folder=` query.

  Cards live in `<domain>/<Domain>Card.tsx` and surface the most useful info at a glance: portrait/icon, title, id, line-clamped description, color-coded Badge components per type/category. Quest cards additionally show objective-type breakdown (`2× kill`, `1× collect`) and reward summary (`150c`, `⌹ 3`, `⚑ 2`), plus an auto-managed-flag strip at the bottom (`ActiveFlag` / `CompleteFlag` / `TurnedInFlag`) only when set. NPC cards have no description field (the schema dropped one), so they instead surface a references block — `dialog: <DefaultDialog>`, `offended: <OffendedDialog>`, `quests: <id1>, <id2>, +N`, `loot: <pickup1>, <pickup2>, +N`, `karma: <DeathImpactId> / <ContextualImpactId>`, `balloons: <basename>, <basename>, +N` — followed by a flag strip (`OffendedFlag` / `ContextualFlag` / `DidSpeakFlag`) matching QuestCard's pattern. Balloon cards mimic an in-game speech bubble: chunky 2px accent border, 7-step pixel-ladder tail (14×14, two-pixel rungs going 14→12→10→8→6→4→2) hanging off the bottom-left, VT323 mono text inside, and the speaker's portrait (xs / 32px, pixel-rendered) tucked inside the bubble on the left at a chat-style position so the eye reads "this NPC says this" without needing the names list as a separate row. Multi-speaker balloons show the first portrait + a `+N` badge; portrait-less NPCs fall back to `PortraitPlaceholder`. Hover plays the **typing animation at the balloon's actual `TypeSpeed`**: empty → full text at `1000/TypeSpeed` ms per character with a blinking `█` cursor while the animation runs. `TypeSpeed === 0` skips the animation entirely — that's the in-game "show all at once" mode and the card stays honest about runtime behavior; mouse-leave during animation cancels the timer and snaps back to full text. The meta strip below the bubble drops the cryptic numeric label (`type 0`) for unit-suffixed display: `instant` when `TypeSpeed === 0`, otherwise `30 cps`; same fix in BalloonRow. Each domain also has a `<Domain>Row.tsx` that renders the same data on a single dense line, hiding softer columns at narrow viewports (`sm:` / `lg:` breakpoints).
- **Dialog source-type filter + folder dots.** [client/src/features/dialog/SourceFilter.tsx](client/src/features/dialog/SourceFilter.tsx) exports the `<SourceFilter>` segmented control (All / NPC / Terminal) and a `useDialogSourceFilter()` hook backed by `localStorage["bleepforge:dialogSourceFilter"]` so the active filter survives the graph ↔ list view toggle (otherwise toggling routes resets to "all"). Both the graph and list views render the same control + share the same hook, and both compute `visibleFolders` the same way — folders that contain at least one sequence matching the active filter are kept; folders unknown to the type index are kept too (a brief boot-window safety so content doesn't pop out). When the active folder is hidden by a filter change, both views auto-hop (`replace: true`) to the first visible folder. [client/src/features/dialog/FolderTabs.tsx](client/src/features/dialog/FolderTabs.tsx) accepts an optional `typesByFolder?: Map<string, DialogSourceType[]>` and renders a small 6px colored square per type inside each tab — orange (`source-npc`) when the folder contains NPC dialogs, green (`source-terminal`) when it has Terminal dialogs, both when mixed. The SourceFilter's NPC/Terminal buttons keep their color always-on (muted at rest, brighter when active) with three layered active cues — inset ring, brighter palette, and a 2px pixel offset shadow — so selection reads clearly without color being the only signal. The "All" button stays neutral. The graph view's per-node Terminal tinting (border, header pill, "TERMINAL" badge) also resolves through `--color-source-terminal-*` so the node mood matches the filter chrome.
- **Toast notifications.** [client/src/components/Toast.tsx](client/src/components/Toast.tsx) provides imperative `pushToast(opts)` / `dismissToast(id)` / `clearToasts()` APIs (mirrors Modal/ContextMenu's module-singleton + pub/sub bus pattern). `<ToastHost />` mounts once at App root. Toasts stack bottom-right, capped at 5 visible (oldest dropped beyond that), default 5s auto-close. Hover pauses the timer (`expiresAt` is pushed forward each animation frame the user is over the toast); the progress bar at the bottom freezes with it. The body is a click target (`<Link>` — navigates and dismisses); the corner × dismisses without navigating. Variants `success` / `info` / `warn` / `error` resolve to emerald / emerald / amber / red borders respectively, all theme-aware via the re-pointed Tailwind palette. Dedupe by `id` — passing the same id replaces an existing toast and resets its timer. **Sync → toast bridge** lives at [client/src/lib/sync/syncToasts.ts](client/src/lib/sync/syncToasts.ts): `useSyncToasts()` (mounted at App root) subscribes to `Bleepforge:sync` and pushes one toast per Godot save, deduped by `sync:<domain>:<key>:<action>`. Updated entities link to their edit form; deleted entities link to the domain list (or `/dialogs?folder=<folder>` for dialogs, since the graph already reads that param). The mapping is the only place that knows route shapes — keeps `Toast.tsx` domain-agnostic so other code can push toasts later. The **saves SSE stream** at [client/src/lib/saves/stream.ts](client/src/lib/saves/stream.ts) is intentionally a separate channel: it dispatches `Bleepforge:save` (not `:sync`) so outgoing user-triggered saves don't toast — they only show up in the Saves tab feed. Two channels, two purposes: sync = "Godot changed, here's a heads-up" (toast-worthy); saves = "audit log of every save in either direction" (tab-worthy).
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
  CasualRemarks          : BalloonLine[]  // array of refs; Godot picks one at random per encounter
                                          // → array of "<folder>/<basename>" balloon ids in JSON
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

**Write-back covers scalars + LootTable + Quests + CasualRemarks.** The writer reconciles 7 string fields (`DisplayName`, `MemoryEntryId`, `OffendedFlag`, `DeathImpactId`, `DeathImpactIdContextual`, `ContextualFlag`, `DidSpeakFlag`), the entire `LootTable` (handles all four cases: none → none / none → some / some → none / some → some — see `applyNpcLootTable` in [server/src/internal/tres/domains/npc.ts](server/src/internal/tres/domains/npc.ts)), the `Quests[]` array of `NpcQuestEntry` sub-resources (`applyNpcQuests` in the same file — handles add / update / remove), and the `CasualRemarks[]` array of BalloonLine ext-resource refs (`applyNpcCasualRemarks`, same file). Each entry's 5 dialog refs (`OfferDialog` / `AcceptedDialog` / `InProgressDialog` / `TurnInDialog` / `PostQuestDialog`) are resolved at save time: the writer pre-discovers all DialogSequence `.tres` paths via `discoverGodotContent`, then for each unique sequence Id used by the JSON it scans those candidates with a line-anchored `^Id = "<seq>"` regex (line anchor matters — a substring match would also hit `NextSequenceId = "<seq>"` on Choice rows and resolve to the wrong file). `QuestId` itself is a plain string, not an ext_resource, so we don't have to look up Quest `.tres` UIDs. The script ext_resource for `NpcQuestEntry.cs` is added on demand. Reference fields (`Portrait`, `DefaultDialog`, `OffendedDialog`) are still left untouched — round-trip preserved but not authored yet. The locator (`findNpcTres`) walks `characters/npcs/<model>/data/` and matches `script_class="NpcData"` plus `NpcId = "<id>"`.

**`CasualRemarks` array writeback** ([applyNpcCasualRemarks](server/src/internal/tres/domains/npc.ts)). The Godot-side schema rename happened mid-implementation: `CasualRemark : BalloonLine` (single ref) → `CasualRemarks : BalloonLine[]` (array, Godot picks one at random per encounter). The writer handles both forms gracefully: it ALWAYS emits the new plural `CasualRemarks = Array[Object]([ExtResource("..."), ...])` shape on save, AND it always removes any legacy singular `CasualRemark = ExtResource(...)` line if present — so unmigrated `.tres` files migrate on first save through Bleepforge. The importer is similarly forgiving (`mapNpc`): it reads `CasualRemarks` if present, falls back to wrapping a singular `CasualRemark` into a 1-element array, normalizes both to the JSON array form. JSON stores entries as Bleepforge-id form `<model>/<basename>` (matching how dialog refs work), not raw `res://` paths. The writer pre-resolves balloon UIDs via `readBalloonUid` (one read per unique entry) before `runWrite`, then the apply pass finds-or-creates ext_resources and stitches them into the array literal.

**Live-sync flow** (single-file watcher): when the NPC `.tres` is gone (e.g. delete), `detectDomain` tags it with the file basename. For the JSON cleanup heuristic, the watcher strips the `_npc_data` suffix from the basename to recover the NpcId — works for the current naming convention.

**`NpcQuestEntry` dialog refs** (5 per entry) are converted from ext-resource paths to DialogSequence Ids during import. The orchestrator builds a `path → Id` map during the dialog pass and passes it to the NPC pass. The single-file `reimportOne` watcher path uses a filename-as-Id heuristic (`<id>.tres → "<id>"`), since the .tres filename = DialogSequence.Id by convention in this corpus.

### Domain 7 — Balloons

`BalloonLine : Resource` ([shared/components/balloon/BalloonLine.cs](../Godot/astro-man/shared/components/balloon/BalloonLine.cs) on the Godot side) — the small "Hi there, traveler!" line an NPC speaks when the player walks up. Smallest authored domain: three scalars, no sub-resources, no FK references in the resource itself. Loaded indirectly: NPCs hold them via `NpcData.CasualRemarks` (array), and the runtime picks one at random in `Npc.Speak()`, gated by `DidSpeakFlag` so each NPC speaks once per session.

```text
BalloonLine
  Text         : string  // multiline
  TypeSpeed    : float   // chars/sec; 0 = instant. Default: 30
  HoldDuration : float   // seconds visible after typing finishes. Default: 2.0
```

`BalloonLine` has **no `Id` property in C#** — the Bleepforge `Id` is the `.tres` filename basename, derived by the importer from the file path. The writer never emits `Id` to the `.tres` (it's a Bleepforge-only synthetic field).

**Folder layout** (Godot side): `characters/npcs/<model>/balloons/<basename>.tres`. The convention is rigid — discovery walks the project, picks up files whose `script_class="BalloonLine"` AND whose immediate parent dir is named `balloons`, and groups them by the grandparent dir basename (the NPC robot model: `hap_500`, `sld_300`, etc.). The convention check is defensive — guards against accidentally bucketing a `BalloonLine` `.tres` placed elsewhere in the project.

**Bleepforge storage**: `data/balloons/<model>/<basename>.json` (folder-aware, mirroring the dialogs domain). Different models could theoretically ship a balloon with the same basename (e.g. `greeting.tres` in two model folders); per-folder JSON keys those collisions out at the storage layer instead of pretending they can't happen.

**Write-back covers all three scalars** — see `applyBalloonScalars` in [server/src/internal/tres/domains/balloon.ts](server/src/internal/tres/domains/balloon.ts). Default-aware: `Text=""`, `TypeSpeed=30`, `HoldDuration=2.0` are omitted from the `.tres` (Godot's behavior on save). The locator (`findBalloonTres`) is direct (no walk): the path is fully determined by `<folder>/<basename>`.

**UI**: list page at [/balloons](client/src/features/balloon/List.tsx) (between Dialogs and Items in the nav). Filters: text search, by-NPC (reverse lookup over `NpcData.CasualRemarks`), by-model (the on-disk folder). Group-by selector: `model` (default) / `npc` / `none`. Cards/list view toggle. The card visual ([BalloonCard](client/src/features/balloon/BalloonCard.tsx)) mimics an in-game speech balloon — see the "List-page card / list view pattern" bullet above for the speech-bubble details. Edit page ([Edit.tsx](client/src/features/balloon/Edit.tsx)) has the three input fields plus a "Used by" reverse-lookup panel that links back to each referencing NPC.

**Catalog integration**: [useCatalog](client/src/lib/useCatalog.ts) loads balloons via `balloonsApi.listAll()` and exposes them as `catalog.balloons` (per-folder groups) plus `catalog.balloonRefs` (flat list with `<model>/<basename>` ids). [CatalogDatalists](client/src/components/CatalogDatalists.tsx) emits `DL.balloonIds` so the NPC form's CasualRemarks editor can autocomplete.

**Integrity check**: any `NpcData.CasualRemarks` entry that doesn't resolve to an existing balloon flags an error ([client/src/lib/integrity/issues.ts](client/src/lib/integrity/issues.ts)).

## Assets gallery + image editor

The eighth surface, but architecturally a different shape from the seven data domains. Routed at `/assets`. Read-only browse + cross-system reference search + a writeback editor (crop / bg-remove / tint / flip / auto-trim / Magic crop) that produces PNG bytes. Same editor is mounted inside [AssetPicker.tsx](client/src/components/AssetPicker.tsx) so the field-level image picker (NPC.Portrait, Item.Icon, Faction.Icon/Banner, DialogLine.Portrait, Concept hero images) gets the same right-click → Edit / Duplicate / Delete and `+ Import` + create-folder affordances; saves auto-pick the new file for the field.

**Server surface** at `/api/assets/*` (in [server/src/lib/assets/router.ts](server/src/lib/assets/router.ts)):

- `GET /images` — every discovered image with descriptor (path, basename, parentRel, format, UID from `.png.import` sidecar, dimensions probed natively, size, mtime).
- `GET /usages?path=...` — reverse-lookup references for one image. Walks `.tres` + `.tscn` + `data/concept.json` and matches by `res://` path or `uid://`. Returns refs with kind (`tres` / `tscn` / `json`), domain (Bleepforge edit-page domain when applicable; null for scenes), key (entity id, scene relative path, etc.), file path, and a snippet line for context. Per-domain Bleepforge JSON cache (data/npcs/, data/items/, …) is deliberately NOT scanned — those mirror their `.tres` 1:1 and would double-count every reference. Concept is the lone JSON exception (Bleepforge-only doc, no `.tres` counterpart).
- `GET /usage-counts` — `Record<absPath, number>` for every cached image, computed via a single inverted-pass walk (one file scan total, increment per matched image — N+M instead of N×M). Powers the eager "used by" pills on first gallery paint. Counts files-referencing, not mention-count (a tilemap that uses one tileset 50 times still counts as 1).
- `GET /folders[?dir=...]` — directory tree for the importer's destination picker. Dirs only, dot-dirs filtered. Path-traversal protected.
- `POST /folders` — create a directory under the Godot project root. Used by the picker's `+ New folder` button and right-click → Create subfolder. Name validated as a basename (no slashes, no leading dots, alnum + `_-.` + space). 409 on EEXIST.
- `POST /import` — write a new (or overwriting) image. Body: `{ targetDir, filename, contentBase64, overwrite? }`. Atomic write (temp + rename, same as the `.tres` writer). 409 on conflict unless `overwrite: true`. Edit / Duplicate flows piggyback on this (Edit always sends `overwrite: true`; Duplicate sends a fresh filename). Always emits PNG regardless of source format — the in-game pipeline expects PNG, keeps the editor's behavior consistent.
- `DELETE /file?path=...` — removes the image AND its `.png.import` sidecar (without the sidecar Godot errors on next focus). `.tres` files holding dangling UIDs after delete still surface in the existing integrity check; we don't sweep them automatically.
- `GET /events` — SSE stream of `AssetEvent` (`added` / `changed` / `removed`). The third SSE channel after `/api/sync/events` (game-domain syncs → toasts) and `/api/saves/events` (save activity feed). Separate channel because asset deltas have different consumers (the gallery + the picker, both refresh-in-place; never toast) — folding into the existing stream would mean discriminator branches on every sync listener.

**Discovery + cache** in [server/src/lib/assets/](server/src/lib/assets/):

- [discover.ts](server/src/lib/assets/discover.ts) walks the project for image files, reads each `.png.import` sidecar for the UID (`uid="uid://..."`), and probes the file itself for dimensions. PNG via native IHDR read (8-byte signature + chunk header at fixed offsets); SVG via a quick width/height/viewBox regex on the first 2KB. Other formats (JPG / WebP / GIF / BMP) get `width: null, height: null` — fine; the UI shows "—". No new dependency.
- [cache.ts](server/src/lib/assets/cache.ts) holds `Map<absPath, ImageAsset>` in memory with a full-rebuild API (`rebuildAssetCache`) plus per-file delta APIs (`upsertImage` / `removeImage`). Boot in `index.ts` calls rebuild after the `.tres` reconcile finishes; the watcher feeds deltas after that.
- Watcher extension in [server/src/internal/tres/watcher.ts](server/src/internal/tres/watcher.ts) — same chokidar instance widened to also pass image extensions through the `ignored` predicate. Image events route to a separate handler that updates the asset cache and publishes an `AssetEvent`; `.tres` events keep their original game-domain pipeline. Routing is by file extension at the top of `handleEvent`.

**Usage scanning** ([usages.ts](server/src/lib/assets/usages.ts)):

- Two functions on the same file walk: `findUsages(asset)` for the per-asset drawer (full reference details), `countAllUsages(images)` for the gallery's eager counts.
- `walkGodotRefs` iterates `.tres` AND `.tscn` together — both formats reference textures via `[ext_resource path="res://..." uid="uid://..."]`, identical match shapes. Skipping `.tscn` would massively undercount tilesets and other scene-resident art.
- `detectTresDomainAndKey` classifies a referencing `.tres` by `script_class` so the drawer can route the user to the right edit page (Item / Quest / Faction / Npc / Dialog / Balloon). `.tscn` files don't get a domain (scenes aren't editable in Bleepforge); their key is the relative path so the drawer still has something useful to show.
- Quick prefilter on `countAllUsages`: skip any file whose text doesn't include `res://` or `uid://`. Most non-trivial files have both; the prefilter saves scan time on small / structural `.tscn` files that don't reference resources.

**Image editor** ([ImageEditor.tsx](client/src/features/asset/ImageEditor.tsx)):

- Mode-discriminated single component: `import` (fresh source from disk → folder picker + filename → save as new), `edit` (existing asset → save back to same path, overwrite), `duplicate` (existing asset → same folder, new filename → save as new). Sidebar fields adjust per mode (folder picker hidden in edit/duplicate; filename input hidden in edit). **Click affordances**: in the gallery, normal-click on an `AssetCard` / `AssetRow` opens the editor in `edit` mode (the most common action — same target as the right-click menu's Edit item); the "used by N" pill keeps its own click (with `stopPropagation`) so it still opens the usages drawer. In the AssetPicker browse modal, click stays as **pick** (the modal's purpose is to assign an image to a field — pick-without-edit is the dominant flow); right-click on any file entry surfaces the Edit / Duplicate / Delete menu via the same `useAssetMenu`. Right-click context menu in [useAssetMenu.ts](client/src/features/asset/useAssetMenu.ts) launches into the right mode + handles the Delete confirm with a usage-count warning.
- Pipeline: `working` canvas accumulates destructive ops (flip / bg-remove / auto-trim); `display` canvas = `working` + tint applied (live preview only — tint bakes at save). Crop is a non-destructive overlay applied at save time. Save flow: `working → tint → crop → PNG → POST /api/assets/import`.
- Undo: 24-deep snapshot stack. Each destructive op pushes a `snapshotCanvas(working)` clone before mutating; Undo pops and replaces. Reset (the text button under Transform) wipes the stack and reloads from `originalRef`. Per-section ↺ icons reset only that section's settings (Crop's rect + snap; Background's sample + tolerance + mode; Tint's color + power + alpha + bg fill); they DO NOT undo destructive ops applied to `working` — that's still Undo. The Transform-section Reset is the global "wipe everything" button.
- One sampler at a time: `samplerMode: "none" | "bg-color" | "magic-crop"` decides what canvas left-clicks do. Activating one auto-deactivates the other — clicking the bg-color eyedropper while Magic crop is active swaps to bg-color, etc. Mutually exclusive UI without separate boolean flags fighting each other.
- Crop canvas ([CropCanvas.tsx](client/src/features/asset/CropCanvas.tsx)) is the Godot AtlasTexture editor's behavior: integer-zoomed nearest-neighbor render, source-pixel-locked rect. Plain wheel = zoom centered on cursor (no modifier — pan is via middle-mouse-drag or space+drag, separate input surface, no fight with vertical-scroll mental model). Click-drag empty = draw crop, click-drag inside rect = move, click-drag handle = resize. Snap-to-grid (1 / 2 / 4 / 8 / 16 / 32 px). Keyboard: arrows nudge by snap (or 8 with shift), alt+arrow resizes, Esc/Del clears. Coordinates always integer pixels — the rect is stored in source-pixel coords, mouse positions are floored to source coords before they ever touch the rect, so half-pixel state can't exist.
- **Tint section** — three dials, all on the [SliderField](client/src/components/SliderField.tsx) + [PixelSlider](client/src/components/PixelSlider.tsx) chrome:
  - **Power** (0-100%) — color mix on visible pixels. 0 = no tint, 1 = solid color, fully replacing original RGB.
  - **Alpha** (0-100%) — output opacity multiplier on visible pixels. 100% = unchanged. Independent from Power so you can fade an un-tinted image.
  - **Bg extent** (0-100%) — extends the tint *color* into transparent pixels at this strength. 0 = visible-only (default); 100 = full bg fill in the tint color. The "subject + bg in the same color" shortcut.
- **Pipeline at save**: `working → tint (incl. Bg extent) → crop → PNG`.
- A separate "Bg color" section (independent backdrop with its own color picker, distinct from the tint color) was prototyped and dropped in the same session — live-preview perf was painful on large images (every slider tick ran two full pixel passes plus a snapshot/getImageData/putImageData round-trip, ~50-100ms per tick on 1024×1024) and the use case was redundant enough with Tint > Bg extent for the pixel-art workflow that the cost wasn't worth fixing yet. Future task if "subject + different-colored backdrop" becomes a real need; the optimization path is clear (rAF-throttled commits, single-pass apply combining tint + bg).
- **Bg removal** — three-tier surface, prominent → fallback. (1) **`✦ ML remove bg`** at the top — runs [`@imgly/background-removal`](https://www.npmjs.com/package/@imgly/background-removal) (BRIA RMBG `isnet_fp16`) lazy-imported on click. First call downloads the ~44MB model to the browser's CacheStorage; subsequent calls skip the fetch. Progress surfaces in a centered modal that overlays the editor while inference runs (modal because a full-width progress bar reads better than a sliver tucked into the sidebar — and the user can't really do anything else while ML is running). The fill bar reflects real progress when the lib emits events (download bytes, compute phases) and runs a CSS shimmer animation continuously so the wait still feels alive between updates (the lib's progress callback only fires a few times per phase, so a width-based bar would otherwise look frozen at 0% / 100% / arbitrary stuck-percentages between events). **Crop-aware**: when a crop is set, only that region runs through ML; the result is composited back into a copy of working with surrounding pixels untouched. **Lib gotcha worth recording**: the lib's TypeScript types claim `ImageData` is an acceptable input, but the runtime tensor path only works for `Blob`/`URL`/`ArrayBuffer` (those go through `imageDecode → ImageBitmap → NdArray`); passing raw `ImageData` fails later with "undefined is not iterable" when the lib destructures a non-existent `.shape`. Fix: always `canvas.toBlob('image/png')` first. (2) **Manual eyedropper + tolerance + mode (`connected` flood-fill or `key` global) + Apply** — for atlases / multi-subject sheets / cases where the ML model gets it wrong. (3) Magic crop in the Crop section above (different operation: bbox the subject vs. mask out the bg, but related — they often compose with each other and with auto-trim).

**Magic crop** ([imageOps.ts → detectSubjectBoundsAtClick](client/src/features/asset/imageOps.ts)) — original to Bleepforge:

- Click-seeded subject detection. Combines perimeter color sampling (for bg classification) with a flood-fill from the click point through all connected non-bg pixels. Bbox of the reached region becomes the crop rect.
- Bg classification: alpha-mode when ≥5% of pixels are transparent (typical pixel-art case → bg = pixels with alpha < 128), otherwise color-mode (bg = pixels matching the dominant perimeter color within Euclidean distance 18).
- Critical bucketing fix in `autoDetectBackground`: PNGs commonly hold garbage RGB on alpha=0 pixels (encoder-dependent — `(0,0,0,0)`, `(255,255,255,0)`, whatever was there before alpha got zeroed). Bucketing by `(r,g,b,a)` split a single transparent background into many tiny buckets, which then lost the modal vote to any opaque perimeter cluster. Fix: collapse all transparent pixels into one bucket regardless of stored RGB. Without this, Magic crop misclassified transparent-bg sprites as having an opaque bg.
- "Click on bg by accident" path: auto-detected (the click point matches the bg classifier), falls back to whole-image perimeter detection. So clicking anywhere produces a useful crop — the click point only ADDS precision when it lands on subject pixels.
- Why this beats ML for pixel art: heuristic runs in <1ms, no model, no bundle weight, fully offline, and handles the canonical pixel-art case (subject on uniform-or-transparent bg) with high accuracy. ML segmentation (Phase 3.6, deferred) earns its keep on photographic / non-pixel-art content where the heuristic breaks (gradient bgs, busy scenes).

**Folder picker + create folder** ([FolderPicker.tsx](client/src/features/asset/FolderPicker.tsx)):

- "Where you are is where you'll save" — the cwd IS the selected destination, no two-step navigate-then-confirm flow.
- Two ways to create a new folder without leaving the editor: `+ New folder` button in the destination header (creates inside the cwd, auto-navigates into it so the picker is already pointing at the user's freshly-made target), and right-click on any folder entry → context menu with `Open` / `Create subfolder in <name>…` (drops inside a sibling without first navigating in). Both go through `assetsApi.createFolder` + `showPrompt` with name validation (alnum + `_-.` + space, no slashes, no leading dots).

**Path safety** (defense in depth) — every file-touching server endpoint validates that the resolved target sits under the Godot project root via `path.relative + startsWith("..")` check. Filenames must be basenames (no slashes, no `..`, no leading dots). Atomic writes for images (temp file + rename). Refuses to overwrite without an explicit `overwrite: true` flag.

**Pixel ops library** ([imageOps.ts](client/src/features/asset/imageOps.ts)) — pure-canvas operations: `flipHorizontal` / `flipVertical`, `autoTrim` (resizes canvas to subject bbox), `removeBackground` (scanline flood-fill or color-key), `applyTint` (with the three independent dials above), `autoDetectBackground` (perimeter histogram), `detectSubjectBoundsAtClick` (Magic crop), `sampleColor`, `snapshotCanvas`, `imageToCanvas`, `canvasToPngBase64`. Round-trips through `getImageData` / `putImageData` — pixel-art assets are tiny (<512×512 typical) so the simplest code is the right code; no workers or WebGL.

**Crop math library** ([cropMath.ts](client/src/features/asset/cropMath.ts)) — pure geometry: snap, clamp, normalize-and-clamp (handles negative-size rects from drag-start-greater-than-drag-end), constrain rect to image bounds, translate, hit-test handle, point-in-rect, resize-by-handle, extract-to-PNG-base64. Source-pixel coords throughout — no half-pixel state ever exists.

## Cross-cutting concerns

### Resource references → string IDs

C# uses direct `Resource` references for cross-type links. Bleepforge flattens these to strings (paths or IDs) for the JSON shape:

| C# field                    | What it points to | JSON representation                                  |
| --------------------------- | ----------------- | ---------------------------------------------------- |
| `DialogLine.Portrait`       | `Texture2D`       | string `res://...png` path                           |
| `ItemData.Icon`             | `Texture2D`       | string `res://...png` path                           |
| `QuestObjective.TargetItem` | `ItemData`        | string item slug                                     |
| `QuestReward.Item`          | `ItemData`        | string item slug                                     |
| `NpcQuestEntry.*Dialog`     | `DialogSequence`  | string `DialogSequence.Id`                           |
| `NpcData.CasualRemarks`     | `BalloonLine[]`   | array of `<model>/<basename>` Bleepforge balloon ids |

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

Bleepforge can now write JSON edits back to `.tres` files. The mappers live in `server/src/internal/tres/domains/{item,karma,dialog,quest,faction,npc,balloon}.ts`; the format library (parser, emitter, mutation helpers, ext-resource creation) is in [server/src/internal/tres/](server/src/internal/tres/). Each domain has a CLI canary that takes a slug/id (and optional JSON overrides), parses the matching `.tres`, applies the JSON, emits to `dialoguer/.tres-staging/`, and shows a unified diff:

- `pnpm --filter @bleepforge/server canary <slug>` — Item
- `pnpm --filter @bleepforge/server canary-karma <id>` — KarmaImpact
- `pnpm --filter @bleepforge/server canary-dialog <folder> <id>` — DialogSequence
- `pnpm --filter @bleepforge/server canary-quest <id>` — Quest

(No canary for Balloons / Factions / NPCs yet — the mappers are still trivially testable through the harness + manual save-from-UI paths.)

Plus `pnpm harness` walks every `.tres` in the project and confirms parser+emitter round-trip is byte-identical (currently 90/90 — the count grew when Balloons came under discovery).

**What's supported:**

- All scalar property types (string incl. multiline, int, bool, enum-as-int).
- Default-aware reconcile per field: insert when JSON is non-default and `.tres` omits it; update when both differ; remove when JSON is default and `.tres` has the line; no-op when matching.
- Position-based scalar reconcile through every nesting level (sequence → lines → choices, quest → objectives/rewards).
- Trailing structural add/remove of sub-resources (lines, choices, objectives, rewards) with orphan cleanup. Mints `Resource_<5alnum>` IDs in Godot's format.
- Ext-resource creation when JSON references something the file doesn't yet point at:
  - Item slugs (TargetItem / Reward.Item) — UID read from `<root>/shared/items/data/<slug>.tres` header.
  - Texture paths (DialogLine.Portrait, Item.Icon, Faction.Icon, Faction.Banner) — UID read from `<png>.import` sidecar via the shared [textureRef.ts](server/src/internal/tres/textureRef.ts) helper. The helper preserves any existing `SubResource` (e.g. `AtlasTexture`) when JSON is empty — Bleepforge doesn't author atlases and shouldn't blow them away on save. When swapping an `AtlasTexture` SubResource for a Texture2D ExtResource, the orphaned AtlasTexture sub_resource is removed so the orphan-ext-resource pass can also clean up its `atlas` ref (the sprite sheet ext_resource).
  - Project scripts (DialogChoice.cs, QuestObjective.cs, QuestReward.cs, NpcQuestEntry.cs, LootTable.cs, LootEntry.cs) — UID found by scanning the project for any other `.tres` that already references the script.

**Reorder-safe via `_subId`:** every sub-resource-backed JSON entry (DialogLine, DialogChoice, KarmaDelta, QuestObjective, QuestReward) carries an optional `_subId` mirroring the Godot sub_resource id. The importer populates it; mappers use it for stable-identity matching across reorder, add, update, and remove. Existing JSON was migrated via `pnpm --filter @bleepforge/server migrate-subids` (idempotent). New entries authored in Bleepforge UI have no `_subId` until first save, when one is minted.

**Save-to-Godot wiring (always on):** the save endpoints — `PUT /api/items/:slug`, `/api/karma/:id`, `/api/quests/:id`, `/api/npcs/:id`, `/api/factions/:id`, `/api/dialogs/:folder/:id`, `/api/balloons/:folder/:basename` — first write the JSON cache, then call the matching mapper to update the live `.tres` in `GODOT_PROJECT_ROOT`. Atomic write (temp file + rename). The save response shape is `{ entity, tresWrite }` where `tresWrite` is `{ attempted, ok, path, warnings, error }` — clients can ignore it for now (api.ts logs to console). Server logs every attempt. Since `GODOT_PROJECT_ROOT` is required at boot, `tresWrite.attempted` is effectively always `true` for game-domain saves. Every successful attempt also gets recorded into the Diagnostics → Saves activity feed (see "Saves tab" above).

**Boot-time cache reconcile (always on):** on every server start, after `app.listen` opens the port, the orchestrator runs once over the whole Godot project and rewrites every JSON in `data/<domain>/`. This catches any edits made in Godot while Bleepforge was off. Cheap (~60ms on the current ~90 .tres files), idempotent, runs before the live watcher starts so we don't double-process churn during startup. If reconcile fails (e.g. a parser regression on one file) the server logs the error and continues with whatever JSON is on disk — better degraded than down.

**Reconcile diagnostics surfaced in the UI.** The boot reconcile itself runs from [server/src/lib/reconcile/bootReconcile.ts](server/src/lib/reconcile/bootReconcile.ts) (extracted from `index.ts` so the entry stays a thin composition file). Its result — per-domain `{imported, skipped, errors}` counts plus the full `errorDetails`/`skippedDetails` lists — is stashed in [server/src/lib/reconcile/router.ts](server/src/lib/reconcile/router.ts) and served at `GET /api/reconcile/status`. The boot log widens whenever something's wrong (`items=6 (errors:1)` instead of `items=6`) and prints one line per skipped/errored file. The client surfaces this in the **Reconcile** tab of the [/diagnostics](client/src/features/diagnostics/DiagnosticsPage.tsx) page (per-domain breakdown + file paths + reasons), and the unified header diagnostics icon reflects the worst-of severity across both tabs. Mappers throw on malformed required fields (e.g. `Slug = ""` or `Id = ""`) so those land in the `errors` bucket with accurate messages instead of being mislabeled as "wrong script_class" skips — the orchestrator's existing `try/catch` routes throws to errors and the message comes through verbatim. Without this, a single broken file silently leaves one domain with stale JSON and the UI gives no signal — easy to miss in browser dev mode and much easier to miss once the app's wrapped in a desktop shell.

**Auto-discovery — no hardcoded subfolders.** [server/src/internal/import/discover.ts](server/src/internal/import/discover.ts) walks the Godot project once and buckets every `.tres` by what it is: `script_class` for `Quest` / `KarmaImpact` / `FactionData` / `NpcData` / `DialogSequence` / `BalloonLine`, and `Slug = "..."` presence for items (so `MedkitData`, `WeaponData`, and any future `ItemData` subclass land in the items bucket without a code change). DialogSequence files are grouped by parent-dir basename (`.../dialogs/Krang/foo.tres` → folder `"Krang"`); BalloonLine files are similarly grouped by their grandparent dir basename, with a defensive check that the immediate parent dir is named `balloons` (so a stray BalloonLine elsewhere wouldn't be misclassified). The previous `KNOWN_DIALOG_FOLDERS` constant and the per-domain `*_GODOT_PATH` constants in the orchestrator are gone — adding a new NPC's dialog folder or balloons folder, or moving content under the project, just works at next boot. Reads the whole file (each is ~1KB; total ~90KB) instead of a header-bytes prefix because the cost is negligible and it removes any "did I read enough bytes for the marker to appear?" fragility.

**Live-sync from Godot (always on):** the server watches `GODOT_PROJECT_ROOT` via [chokidar](https://github.com/paulmillr/chokidar) (filtered to `.tres` and excluding the `.godot/` cache). On external change: re-imports that one file via the import mappers, overwrites the matching JSON in `data/`, and publishes a `SyncEvent` (`{ domain, key, action }`) on an in-memory bus. The SSE endpoint `GET /api/sync/events` streams those events to any open browser tab. The client opens an `EventSource` once at app boot ([client/src/lib/sync/stream.ts](client/src/lib/sync/stream.ts)), re-dispatches each event as a `Bleepforge:sync` window CustomEvent, and components register via `useSyncRefresh({ domain, key, onChange })` to refetch when their entity changes.

We use a 150 ms per-path debounce we control rather than chokidar's `awaitWriteFinish` — the latter has a stuck-state bug for atomic-rename saves where the new file ends up with the same byte size as the old one (the polling state machine waits forever for a stabilization that never comes). Symptom was reliable: a specific dialog would stop firing watcher events after a save or two and stay silent until the server restarted.

Self-write suppression in [server/src/internal/tres/writer.ts](server/src/internal/tres/writer.ts): every save records the path with a timestamp; the watcher skips events for paths within a 1.5 s window. Without this, a Bleepforge save would trigger our own watcher → re-import → emit event → client refetch (harmless but wasteful).

UI subscribers: every list/edit page wires `useSyncRefresh` for its domain (item, karma, quest, dialog, balloon, npc), the dialog graph view subscribes for the active folder, `ItemIcon` re-fetches its descriptor on item events (so a Godot-side icon change shows up live), and `useCatalog` (autocomplete) bridges through the catalog-bus so it also refreshes on any sync event. The same SSE stream also drives the toast notifications via `useSyncToasts` — see "Toast notifications" above for the click-to-navigate / dedupe / pause-on-hover behavior.

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
- ~~**Diagnostics → Saves tab**~~ — done. Live SSE-pushed activity feed of every `.tres` save in both directions, with direction filter, clickable row links, warnings/errors expanded inline. See the "Saves tab" bullet under "Diagnostics page".
- ~~**Balloons domain**~~ — done. Seventh authored domain. Cards mimic in-game speech balloons with the speaker's portrait inside; group-by selector and by-NPC + by-model filters. `NpcData.CasualRemark` (singular) → `CasualRemarks` (array, random pick) migration handled gracefully on both import and writeback.
- ~~**Client `src/` reorg**~~ — done. Split the flat top-level into `components/`, `styles/`, `lib/`, `features/` (with plumbing under `lib/sync/`, `lib/saves/`, `lib/integrity/`). See "Client src/ structure" below.
- ~~**Server `src/` reorg**~~ — done. Mirrors the client shape: `features/` for game-domain HTTP routes, `lib/` for infrastructure (incl. extracted `lib/reconcile/bootReconcile.ts` so the entry stays thin), `internal/` for the substantial libraries (`tres/` + `import/`). `index.ts` modularized into a phase-numbered ~125-line composition file. See "Server src/ structure" below.
- ~~**Assets gallery + image editor (Phases 1 + 3)**~~ — done. Eighth surface, see the dedicated section above. Browse + usage-tracking (incl. `.tscn` scenes) + Edit / Duplicate / Delete via right-click + Importer with crop / bg removal / tint / flip / auto-trim / Magic crop. Same editor reused inside AssetPicker. Per-section ↺ resets and `+ New folder` in the destination picker.
- ~~**ML background removal (Phase 3.6)**~~ — done, browser-side via [`@imgly/background-removal`](https://www.npmjs.com/package/@imgly/background-removal) (BRIA RMBG `isnet_fp16`). The original plan was server-side `onnxruntime-node`, but the Node variant of the lib was 2 years stale on npm; the browser variant is actively maintained and competitive on speed thanks to WebGPU when available. For a single-user tool, the model lives in the user's browser CacheStorage (~44MB downloaded once on first use) instead of a server-side disk cache, which removes ~50MB of native ONNX binaries from the dependency tree and dodges the platform-binary headache when we wrap in Electron later. Lazy-imports the lib so the editor's first paint doesn't pay the load. Magic crop stays the default for pixel art; ML is the "hard cases" fallback (gradient bgs, photographic sources).
- **Image editor extensions** — deferred until needed: integer-multiple resize / scale (pixel-art upscaling), recolor (palette-swap one color → another), 1-pixel outline. All fit the existing destructive-op pipeline + Undo stack.
- **Audio support (Phase 2)** — deferred. Corpus has zero audio files today. When the first lands: extend assets discovery to `.ogg` / `.wav` / `.mp3`, add a tab to `/assets`, build an audio player on `PixelSlider` for the seek bar. Asset router already supports HTTP Range requests via Express's `sendFile`.
- **Wrap with Electron** — the next big move. See "Next big move" at the top.
- v1 polish on existing UIs (deferred — Yonatan: "we'll polish with time").

## Client `src/` structure

Top-level layout, after the late-series reorg:

```text
client/src/
  components/   reusable visual components — AssetPicker, AssetThumb, Button,
                CatalogDatalists, ContextMenu, ItemIcon, Modal,
                PixelPlaceholder, SplashScreen, Toast, ViewToggle
  styles/       theming + tokens + global CSS — Theme.tsx, themeColors.ts,
                Font.tsx, GlobalTheme.tsx, classes.ts (small Tailwind class
                strings: textInput / button / fieldLabel — was ui.ts at root),
                index.css
  lib/          non-visual utilities + plumbing — api.ts, useCatalog.ts,
                catalog-bus.ts, plus four plumbing subfolders:
                  lib/sync/      SSE client + useSyncRefresh + useSyncToasts
                  lib/saves/     saves SSE stream + route mapping
                  lib/assets/    asset-events SSE stream + useAssetRefresh
                  lib/integrity/ computeIssues pure function
  features/     user-facing pages, one folder per domain — asset, balloon,
                concept, dialog, diagnostics, faction, item, karma, npc,
                preferences, quest. Each holds Edit.tsx + List.tsx + (where
                relevant) Card.tsx / Row.tsx / domain-specific helpers.
                features/asset/ also ships the image editor itself
                (ImageEditor + CropCanvas + CropControls + FolderPicker +
                imageOps + cropMath + UsagesDrawer + useAssetMenu).
  App.tsx       entry component — header nav, routes, mounts the singleton
                hosts (ModalHost, ToastHost, ContextMenuHost, CatalogDatalists)
  main.tsx      Vite entry — boots BrowserRouter, opens the three SSE channels
                (sync + saves + assets), imports the global CSS
```

The split follows three rules:

1. **`components/` is reusable visual primitives only.** No business logic, no SSE, no API calls beyond what the component itself fetches (e.g. `AssetThumb` resolves a path → URL).
2. **`features/` is "user-facing pages."** Each subfolder is one route/domain. The diagnostics page lives here too (it's a user-facing surface, just one for app meta-state instead of game content).
3. **`lib/` is everything non-visual.** Plumbing folders (`sync/`, `saves/`, `integrity/`) live here even though they have UI bridges (e.g. `lib/sync/syncToasts.ts`) — the bridges are mounted by `App.tsx` so they don't live in components/.

Only `App.tsx` and `main.tsx` stay at top level — they're entry points, not reusable. The reorg was done with `git mv` so `git log --follow` and `git blame` still work cleanly across the move.

## Server `src/` structure

Mirrors the client's split, server-side:

```text
server/src/
  features/    HTTP routes per game-domain — balloon/, concept/, dialog/,
               item/, preferences/. The five flat-domain endpoints
               (quests, items, karma, npcs, factions) don't have folders
               here because they share the generic `makeCrudRouter`; the
               authored apply mappers for them live under internal/tres/
               domains/.
  lib/         infrastructure + utilities mounted at /api/<name> or used
               cross-cuttingly:
                 lib/asset/         single-file image-serving (/api/asset)
                                    + AssetPicker filesystem browse
                 lib/assets/        gallery + image editor surface
                                    (/api/assets/*) — discover.ts walks the
                                    project, cache.ts holds the in-memory
                                    Map, usages.ts scans .tres + .tscn for
                                    refs, eventBus.ts + router.ts ship the
                                    SSE channel and the import / delete /
                                    folder endpoints
                 lib/godotProject/  project-root introspection + validate
                 lib/logs/          ring buffer + GET /api/logs
                 lib/pickup/        collectible-scene catalog (read-only)
                 lib/process/       server identity / uptime / config
                 lib/reconcile/     status router + bootReconcile.ts
                 lib/saves/         buffer + bus + SSE router
                 lib/sync/          watcher event bus + SSE router
                 lib/util/          jsonCrud generic CRUD helpers
  internal/    substantial libraries that aren't HTTP features:
                 internal/tres/     parser + emitter + writer + watcher
                                    + watcher router + per-domain apply
                                    mappers (domains/) + CLI scripts
                                    (canary*, harness, migrate-subids,
                                    test-mutations)
                 internal/import/   boot reconcile pipeline (discover,
                                    mappers, orchestrator, tresParser)
  config.ts    folderAbs + Godot project root resolution
  index.ts     entry — phase-numbered: log capture (1) → fail-fast on
               missing godotProjectRoot (2) → build app: storages + route
               mounts (3) → listen + runBootReconcile + startTresWatcher
               (4). The heavy reconcile-result flattening lives in
               lib/reconcile/bootReconcile.ts so this file stays a thin
               composition file (~125 lines, down from ~200 pre-extract).
```

The **internal/** tier exists because tres/ and import/ are full libraries
(20+ files, with their own CLI scripts and types) — putting them under
lib/ buries them; leaving them at root crowds the entry. Their own bucket
signals "support code, not part of the HTTP feature surface" without the
weight of `lib/`.

The CLI scripts in `internal/tres/` are wired through `package.json` —
`pnpm canary <slug>` / `pnpm harness` / `pnpm migrate-subids` etc. Those
script paths point at `src/internal/tres/<file>.ts` post-reorg; user-
facing invocations are unchanged.

## Collaboration

Per Yonatan's global CLAUDE.md: docs are built together, I'm expected to have opinions and push back. This file evolves as we learn — not a static spec.
