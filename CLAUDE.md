# Bleepforge

> **Looking for a project overview?** See [README.md](README.md) — public-facing intro, quick start, architecture sketch, roadmap. **This file** is the internal project bible: design rationale for every surface, schema definitions, the *why* behind every decision. Read CLAUDE.md when you want to understand the codebase deeply; read the README to install and run.

**A schema-driven content authoring studio for Godot projects.** Currently bootstrapped against Yehonatan's game **Flock of Bleeps** (formerly placeholder "AstroMan" — the C# namespace and project folder still use the old name); the long-term direction is to be generic for any Godot project's content (see "Genericize for any Godot project" under Editor scope / next steps). Authors **dialogues** (graph view + multi-folder), **quests**, **items**, **karma impacts**, **NPCs**, **factions**, and **balloons** (the small "Hi there!" lines NPCs say when the player walks up), plus a **Game Codex** (Bleepforge-only notebook for project-specific concepts that don't fit a hardcoded domain — Hazards, Locations, etc., with user-defined property schemas), an **assets gallery + image editor** (crop, tint, bg removal, Magic crop) for the project's images, a **shaders surface** with in-app `.gdshader` authoring (CodeMirror editor with GDShader syntax, live WebGL2 preview canvas with a GDShader → GLSL ES subset translator, auto-generated uniform controls, cross-system usage tracking), and an **in-app Help library** (Bleepforge-only documentation surface, dev-mode-gated authoring). Also serves as the project bible — see [data/concept.json](data/concept.json) for the canonical pitch, acts structure, and faction roles.

**`.tres` is canonical, JSON in `data/` is a derived cache** (for the seven hardcoded game-domain surfaces). The Godot `.tres` files are what the game runtime loads, so they're the source of truth: anything that ships is what's in `astro-man/`. Bleepforge's JSON in `dialoguer/data/{dialogs,quests,items,karma,npcs,factions,balloons}/` is a cache rebuilt from `.tres` on every server start, kept in sync afterward by the live watcher, and pushed back to `.tres` on every save. We still commit the JSONs to git as a redundant safety net (so historical states are queryable from either side), but they should never be edited by hand — any drift gets reconciled away on the next boot. Bleepforge-only files are **not** part of the cache and are authoritative state: `data/concept.json`, `data/preferences.json`, per-folder `data/dialogs/<folder>/_layout.json` (graph node positions and edge styles), the entire **`data/codex/`** tree (Game Codex categories + entries — Bleepforge-only, never round-tripped to Godot), and the entire **`data/help/`** tree (in-app Help library categories + entries — same Bleepforge-only model).

**Godot project on disk**: `/home/ymoravia/Data/Projects/Godot/astro-man/`. The project root is **required** — Bleepforge refuses to start without it (no project root → nothing to read or write, so we fail fast instead of presenting an empty UI). Resolution order at boot: `data/preferences.json#godotProjectRoot` (set in-app via Preferences) → `GODOT_PROJECT_ROOT` env var → fail. The env var is the bootstrap fallback for first run before preferences exist; once you save a path in Preferences, that takes priority. Changes to the saved value require a server restart (no hot-swap — the resolved value is captured once at module init). Defense in depth: the writer refuses any target outside the resolved root. The schema sections below mirror the Godot Resource fields 1:1 so the mappers can apply JSON edits to the corresponding `.tres` properties.

## Stack

- **Frontend**: React + TypeScript + Tailwind + Vite
- **Backend**: Express + TypeScript
- **Persistence**: `.tres` (canonical, in the Godot project) + JSON cache at `dialoguer/data/<domain>/<id>.json` (rebuilt on boot, kept live by the watcher)

## v1 plan (decided)

**Scope** — seven Godot-mirrored data domains, one Bleepforge-only multi-category authoring surface, and a Bleepforge-only concept doc:

1. Dialogs (`DialogSequence` / `DialogLine` / `DialogChoice`) — **CRUD + interactive graph view + multi-folder implemented**
2. Quests (`Quest` / `QuestObjective` / `QuestReward`) — **implemented**
3. Items (`Item`, `Category="QuestItem"` discriminates `QuestItemData`) — **implemented**
4. Karma impacts (`KarmaImpact` / `KarmaDelta`) — **implemented**
5. NPCs (`NpcData` — full authoring; `LootTable` editor + `Quests[]` editor + `CasualRemarks[]` array editor implemented) — **implemented**
6. Factions (`FactionData`) — **implemented**
7. Balloons (`BalloonLine`) — **implemented**
8. Game Codex — Bleepforge-only authoring surface for user-defined categories (e.g. Hazards) with custom property schemas. Never round-tripped to Godot. — **implemented**

Plus **Game concept** — a single Bleepforge-only doc (`data/concept.json`) used as the app homepage, *not* exported to Godot. Holds title, tagline, description, logo/icon/splash images, genre, setting, status, inspirations, notes. Covered in the "Architecture decisions" section below.

Plus **Assets gallery + image editor** — Bleepforge's ninth surface, architecturally distinct from the seven Godot-mirrored data domains AND from Codex: there's no `.tres` source of truth and no authored schema, because the assets ARE the files on disk. Browses every image in the Godot project, surfaces "used by N" scene + resource references on first paint, ships an in-app editor (crop, bg removal, tint, flip, auto-trim, Magic crop) that writes PNG bytes back to the project, and is reused inside the AssetPicker so every image-field in the rest of the app gets the same Edit / Duplicate / Delete + Import + create-folder affordances. Covered in the "Assets gallery + image editor" section below.

Plus **Shaders surface** — Bleepforge's tenth surface, file-based like Assets: the `.gdshader` text files in the Godot project ARE the source of truth, no JSON cache, no `.tres` round-trip. All three phases shipped — browse, view, edit, save, new (from template), duplicate, delete, cross-system usage tracking, CodeMirror editor with GDShader syntax, watcher + SSE for live cross-window sync, AND a live WebGL2 preview canvas that re-translates GDShader → GLSL ES on every edit with auto-generated uniform controls (sliders for `hint_range`, color pickers for `source_color`, etc.). Covered in the "Shaders surface" section below.

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

**Electron desktop wrap (Phases 1 + 2 done):** runs as a desktop app via `pnpm dev:desktop` (dev) or as a packaged AppImage built via `pnpm dist` (prod). **Phase 1** = the dev-mode window: Vite (5173) + Express (4000) keep running unchanged in their existing tsx-watch / vite-dev configurations, an Electron BrowserWindow loads `http://localhost:5173`, HMR works because the renderer is just Vite, SSE works because both ends are localhost, types stay strict throughout. **Phase 2** = production packaging: a single ~115MB Linux AppImage that boots Express in-process inside Electron main, serves the built React bundle from the same Express, and persists user state under `~/.config/Bleepforge/`. The server bundle is produced by esbuild (workspace deps like `@bleepforge/shared` get inlined; npm deps stay external and ship in node_modules); electron-builder packages everything into `app.asar` plus the bundled help library at `seed/help/`. The main window opens **maximized** (not literal fullscreen — title bar + WM controls stay visible), the OS menu is **stripped globally** so every window shows only the WM's native close/min/max controls, and **Diagnostics / Help / Preferences** open as **chromeless popouts** in their own windows (no app header / footer, sized to fit content) when their icons are clicked from the main window — falling back to plain in-window navigation in browser mode. Rationale for Electron over Tauri: Electron's main process *is* Node, so Express boots in-process via dynamic import — no sidecar, no Rust. The diagnostics surface that shipped before this is the payoff — once the terminal goes away inside a packaged binary, the user still has Logs / Saves / Process / Watcher tabs to see what's happening. See "Electron desktop wrap" below for architecture and the Linux-specific landmines we hit getting Phase 2 to actually run.

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
- **App search.** Navbar-mounted go-anywhere search at [AppSearch.tsx](client/src/components/AppSearch.tsx), backed by [Fuse.js](https://fusejs.io/) and indexed off `useCatalog`. `Ctrl/Cmd+K` from anywhere focuses the input; `↑↓` walk the dropdown (active row scrolls into view), `Enter` navigates, `Esc` clears-then-closes, mouse hover also moves the highlight. Click outside closes without clearing the query — re-focus restores the last search. Each row carries a fixed-width per-kind badge with the full domain name (`NPC` / `Item` / `Quest` / `Karma` / `Faction` / `Dialog` / `Balloon` / `Page`) in a stable Tailwind hue (amber / cyan / red / violet / orange / blue / pink / neutral) — picked from palettes the theme system doesn't retint, so "Quest = red" stays true on every theme. Emerald is reserved for the active-row cue and not handed out to any kind. Catalog refresh is automatic via the catalog-bus, so the Fuse index rebuilds on every save / Godot sync without extra wiring.

  **Index shape** in [buildIndex.ts](client/src/lib/search/buildIndex.ts) is identity-only — no descriptions, no dialog line text, no quest body. NPCs by NpcId + DisplayName, items by Slug + DisplayName, quests by Id + Title, karma by Id, factions by Faction enum + DisplayName, dialog sequences by Id (folder as side-context), balloons by Text + basename (model as side-context), plus 4 static destinations (Concept, Assets, Diagnostics, Preferences). Full-content search was deliberately scoped out: it'd mean fetching every dialog/balloon body and Fuse-noise on common words drowning the canonical entity (a "scavenger" search hitting 12 lines and burying the Faction row). For a single-author corpus where name/id recall is high, signal-to-noise wins over coverage. Balloons are the principled exception — they have no `Id` property in C#, so `Text` IS the identity-thing the user reads.

  **`threshold: 0` — substring, not fuzzy.** Fuse's default `0.4` Bitap-leniency surfaced false positives like the karma impact `korjack_facility_cleanup_turned_in` for the query `eddie` (`turn`**`ed`**`_`**`i`**`n` clears the threshold). For a single-author corpus where the user knows their own ids, predictability beats typo-tolerance — pure substring matching with Fuse's position/length ranking still gets "edd" → Eddie at the top while gating out unrelated near-matches. The threshold is one line away if that ever flips, and we deliberately did NOT expose it as a Preference (premature setting for a probably-one-time pick — settings are tech debt, hard to remove once shipped).
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
- **Splash screen** ([client/src/components/SplashScreen.tsx](client/src/components/SplashScreen.tsx)) fires on every fresh mount of the app (i.e. real refresh / first load) — except in popout windows, which skip it (`showSplash = !popout` initial state — popouts are focused subviews, not full sessions). A centered content block (sized at `min(80vw, 520px)`) on a near-full-window dark overlay (`fixed inset-[2px]`); the overlay hides the app shell hydrating underneath so the user never sees a partially-painted UI flicker through. **The splash content has no border of its own** — the OS window is sized to match the splash (640×520, see "Window mode + menu" below), so the body's own emerald outline (the soft window-edge accent from index.css that every other Bleepforge window uses) sits right where a card border would, and adding one to the splash content too would just double up. The 2px inset on the overlay (rather than `inset-0`) is load-bearing — `inset-0` would paint over the body's outline and hide it during the splash; the 2px gap lets the outline show through. Inside: BLEEPFORGE display title, pixel progress bar, percent label, and a slot below for either the flavor status line or the CONTINUE button. The current URL is preserved across the splash because the router doesn't re-mount — F5 on `/quests` goes splash → continue → `/quests`. The same `<CreditLine>` rendered by the footer is pinned to the overlay's bottom (not the card) so the authorship attribution greets you on both ends.

  **Real progress, not a 2-second fake.** Driven by [useBootProgress](client/src/lib/boot/progress.ts) against three checkpoints, completed in this rough order:
  1. **server** — `/api/health` responded 200. Fired from [main.tsx](client/src/main.tsx) via a one-off `fetch` at module load.
  2. **preferences** — `/api/preferences` fetched + active theme applied. Fired from [GlobalTheme.tsx](client/src/styles/GlobalTheme.tsx)'s `initAsync` finally-block (whether the fetch succeeded or fell back to cache — either way the user's saved theme is in effect, so the first paint after splash matches it).
  3. **catalog** — `useCatalog`'s first batch loaded (so the first list page the user lands on isn't lazy-fetching its corpus).

  Intentionally NOT in the gate: SSE streams (reconnect on demand), asset cache (lazy), boot reconcile (server-side, parallel — we just need the server *responsive*, not done). Waiting for everything would push the splash past 3s on every launch; three checkpoints + a 10s timeout caps the wait and a flat `markBootCheckpoint(cp)` API makes wiring new ones trivial.

  **Timeout state.** After 10s without all three checkpoints, the store flips `timedOut: true`. The splash swaps the flavor line for `SERVER SLOW TO RESPOND` and reveals the CONTINUE button (labeled "CONTINUE ANYWAY") so the user isn't stuck on a spinner if the server failed to boot. If everything resolves *after* the timeout, `ready` takes priority — the label flips back to "CONTINUE" and the warning text disappears.

  **Flavor lines tied to phase, plus a sticky READY line on completion.** Three flavor strings are picked at mount from a 15-entry pool (`POLISHING BLEEPS`, `CALIBRATING SCAVENGERS`, `WINDING THE GROVE`, `LOADING KARMA TABLES`, …) — one per checkpoint. As each checkpoint completes, the status line advances to the next picked flavor. Once all three fire, the status line switches to a randomly-picked READY message (`ALL SYSTEMS ONLINE`, `ALL DATABASES LOADED`, `BLEEPFORGE STANDING BY`, `READY TO FORGE`, `AWAITING INPUT`) that **sticks above the CONTINUE button until the user clicks**. This is the load bearing piece for fast hardware — without it, on a quick machine the bar goes from 0 → 100 too fast for the user to read the per-phase flavor, and the splash feels like a flicker rather than an event. The READY line is always there waiting, so the user gets the "done" cue regardless of how fast the actual checkpoints completed. Boot-line entries dropped their trailing `...` so the splash can append `…` (the single-codepoint ellipsis) once, keeping spacing consistent across the loading vs. timeout vs. flavor variants.

  **Glow on the CONTINUE button.** Slow emerald breath via the `splash-continue-glow` keyframe in [index.css](client/src/styles/index.css) — 2.4s loop. Implemented as an `::after` pseudo-element behind the button (`z-index: -1`) carrying a fixed `background: var(--color-emerald-500)` + `filter: blur(14px)`; the only animated property is `opacity` (from `0.18` to `0.6` and back). **Crucial detail**: earlier versions animated the box-shadow color directly (varying alpha via `color-mix`), which read as flicker / on-off rather than a smooth breath. `box-shadow` is a *paint* property — Chromium repaints every frame, and the dithering on the blurred shadow shifts visibly between samples. `opacity` (and `transform`) are *compositor-only* properties — interpolated on the GPU without repainting — so animations on them are buttery and exactly what "breath" needs. General rule: whenever an animation reads as flickery rather than smooth, check whether the property being animated forces a repaint, and rewrap it as opacity/transform on a separate element if so.

  **Fade-out on dismiss.** Click CONTINUE → 220ms opacity transition on the overlay + slight scale-down on the card (`scale-95`) → `onDone` unmounts the splash. The app shell is already painted under the overlay at that point (it's been hydrating in parallel the whole time), so the user sees a smooth wipe to the home page — no flicker, no jump, no flash of a partially-built UI. The "wipe over already-painted app" is the whole point of keeping the overlay opaque (vs. blurred-over-app, which would expose loading flicker AND cost a `backdrop-filter` repaint).

  **Cold-start flash fix in [index.html](client/index.html).** Inline `<style>html, body { background: #0a0a0a; }</style>` in the head, applied before any Vite/Tailwind CSS bundle loads. Without it, the very first browser paint is white (browser default), then goes dark when the CSS bundle resolves — that flash was invisible when the splash was full-window but became visible the moment the splash shrank to a centered card. The inline style guarantees the page is dark from frame 1.

  **No min duration.** If the corpus is tiny and startup completes in 200ms, the splash flashes through that fast — by design. The CONTINUE button (which requires a click) is the natural pause; we don't pad with ceremony.
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

Loaded by `ItemDatabase` (autoload). Scans `res://world/collectibles/` recursively, picks up every `.tres` / `.res`, indexes by `ItemData.Slug`. **Empty slugs warn; duplicate slugs warn (first one wins).** Items live next to their collectible scenes at `world/collectibles/<category>/data/<slug>.tres` where `<category>` is the collectible-type folder (`ammo`, `credits`, `keycards`, `medkit`, `optical_part`, `small_gun`, …). The category dir isn't derivable from the slug, so Bleepforge's writeback locators (`findItemTres` in [writer.ts](server/src/internal/tres/writer.ts), `readItemUid` in [uidLookup.ts](server/src/internal/tres/uidLookup.ts)) walk the category subfolders content-matching on `Slug = "<slug>"` — same shape as `findNpcTres`. Boot reconcile + the orchestrator's quest-side ext-ref resolver are already path-agnostic (discovery buckets items by `Slug` presence regardless of folder); the per-file watcher reimport regex in [reimportOne.ts](server/src/internal/tres/reimportOne.ts) and the live icon endpoint in [iconRouter.ts](server/src/features/item/iconRouter.ts) (more on this below) are the two path-coupled pieces on the read side.

**Item icons live as standalone PNGs** at `world/collectibles/<category>/art/<slug>.png`, referenced from the item `.tres` as `Icon = ExtResource("...")` pointing at a `Texture2D` ext_resource. This is the second authored form; **the corpus originated with AtlasTexture sub_resources** — a `Rect2` region inside the shared `world/art/Tileset-32x32-Objects-Sci-Fi.png` tileset — but those were swapped to standalone PNGs in May 2026 because Bleepforge's image pipeline serves flat PNG bytes only (no live atlas-slicing). The atlas form is still legal and tolerated: the writer's [textureRef.ts](server/src/internal/tres/textureRef.ts) preserves any existing `AtlasTexture` sub_resource when JSON's `Icon` is empty (so a user-authored atlas region isn't blown away on save), and swaps to `Texture2D` ExtResource only when JSON sets `Icon` to an absolute path. **The Items page does NOT read JSON's `Icon` field directly** — `ItemIcon` calls `/api/item-icon/:slug` ([iconRouter.ts](server/src/features/item/iconRouter.ts)) which re-parses the live `.tres` and returns either `{kind:"image", imagePath}` or `{kind:"atlas", atlasPath, region}`. The client then renders the atlas case as a CSS-clipped sub-rect of the source tileset. So even if you author an AtlasTexture by hand in Godot, Bleepforge's items page will display it correctly; only the writeback path stays flat-PNG-only. **Note on art-file naming**: 4 of 7 items follow `world/collectibles/<category>/art/<slug>.png` strictly (`small_gun`, `ammo`, `credits`, `rff_keycard`). The other 3 use a category-name basename instead of the slug (`medkit/art/medkit.png` for slug `medkit_small`, `optical_part/art/optical_part.png` for slug `eddie_optical_part`, `keycards/art/facility_keycard.png` for slug `recycling_facility_keycard` after the May 2026 keycard slug rename). Functional but inconsistent — slug-equals-basename is the convention to follow for new items.

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

### Domain 8 — Game Codex

Bleepforge-only multi-category authoring surface. The user defines their own *categories* (e.g. "Hazards", "Locations") with custom property schemas, then creates entries within them. Never round-tripped to Godot — pure JSON under `data/codex/`. If a category eventually earns a real schema with `.tres` writeback, it graduates out of the Codex into a proper hardcoded domain — Codex's role is the **staging ground** for that graduation, not a parallel production pipeline. Pairs with **Game Concept** (homepage doc): both are Bleepforge-only meta-surfaces "about the project itself."

```text
CodexCategoryMeta (per-category schema, lives at `data/codex/<category>/_meta.json`)
  Category    : string  // [a-zA-Z0-9_-]+, matches folder name
  DisplayName : string
  Color       : enum { emerald, amber, red, blue, violet, cyan, orange, pink }
  Properties  : CodexPropertyDef[]
  CreatedAt   : ISO timestamp (immutable)

CodexPropertyDef
  Key         : string  // [a-zA-Z][a-zA-Z0-9_]*
  Label       : string
  Type        : enum { text, multiline, number, boolean, image, ref, tags }
  RefDomain?  : enum { npc, item, quest, faction, dialog, balloon }  // when Type=ref
  Required    : boolean
  DefaultValue: JsonValue (optional)

CodexEntry (one per file at `data/codex/<category>/<id>.json`)
  Id          : string  // [a-zA-Z0-9_-]+, NOT "_meta"
  DisplayName : string  // default ""
  Image       : string  // optional absolute path, served via /api/asset
  Description : string  // multi-line plain text
  Path        : string  // free-form documentary string ("scripts/hazards/lava.gd")
  Properties  : Record<string, JsonValue>  // keyed by CodexPropertyDef.Key
```

**On-disk layout**: `data/codex/<category>/_meta.json` (schema) + `data/codex/<category>/<entryId>.json` (one per entry). `_meta` is a reserved entry id (server-side guard in [server/src/features/codex/storage.ts](server/src/features/codex/storage.ts) — without it the entry route would clobber the schema file). Routes are folder-aware in the same shape as balloon's, with two extra endpoints for the meta and a category-level DELETE; meta routes are registered before the generic `/:category/:id` pair so Express's first-match-wins picks them up.

**Property-type → form control** (in [client/src/features/codex/Edit.tsx](client/src/features/codex/Edit.tsx)):

- `text` / `multiline` / `number` → standard inputs
- `boolean` → checkbox
- `image` → `AssetPicker` (reuses the universal click-rule from CLAUDE.md)
- `ref` → `<input list=...>` autocomplete via the catalog's existing datalists (`DL.npcIds`, `DL.itemSlugs`, etc.)
- `tags` → `TagInput` chip control (comma or Enter commits, Backspace on empty draft removes the last chip)

**Three default fields on every entry** — `Image` (optional), `Description` (multi-line), `Path` (optional documentary string). Image renders as a thumbnail in cards and rows with `IconPlaceholder` fallback when empty; Path is free-form text with no validation or Godot coupling (kept it documentary so the user has a place to write "where to find this in the project" without dragging in `res://` semantics).

**Per-category color** is one of eight named Tailwind palettes (the same set the AppSearch kind-badges use, [client/src/features/codex/categoryColor.ts](client/src/features/codex/categoryColor.ts)). The color tints the section header on the list page, the top stripe on each card, and the swatch in the color picker; AppSearch's per-row badge stays a fixed slate so the per-kind color stays stable regardless of how many categories exist (the category's display name lives in the row's side-context slot).

**Validation in two layers**:

1. Structural type-vs-value (in `validatePropertyValue` / `validateEntryAgainstMeta`, [shared/src/codex.ts](shared/src/codex.ts) — shared between server's `writeEntry` and client's form). Required fields, type mismatches.
2. FK-ref existence (client-only, in [client/src/features/codex/propertyValidator.ts](client/src/features/codex/propertyValidator.ts)). Layered on top using the existing `useCatalog`. Surfaces both as inline form errors and integrity-tab errors. Server doesn't repeat this check because the cross-domain catalog isn't materialized server-side.

**App search integration**: every Codex entry is indexed by `DisplayName` (or `Id` when display name is empty) in [client/src/lib/search/buildIndex.ts](client/src/lib/search/buildIndex.ts), with the category's display name as the side context. Kind label `"Codex"`, fixed slate badge color in [client/src/components/AppSearch.tsx](client/src/components/AppSearch.tsx).

**No saves-feed integration, no `.tres` round-trip, no watcher hook** — Codex is intentionally outside all the Godot-mirrored infra. PUT /api/codex/* writes JSON directly; errors surface via Logs (`console.error` capture) and inline form validation. The PUT response wraps the entity in `{ entity, tresWrite: { attempted: false } }` for shape-parity with the other domains, which is what the client's `unwrapSavedResponse` adapter expects.

**Navbar placement**: between Items and Assets — `Game concept | ... | Items | Game codex | Assets`. Codex + Assets become the trailing "catch-all" pair: Codex for design content without a schema, Assets for files. `Game concept` stays leftmost as the homepage; the linguistic pair (`Game concept` + `Game codex`) is acknowledged but not visually clustered, since their shapes (single doc vs multi-category authoring) are different enough that users won't expect them to behave the same.

**Atlas-region extraction (recurring pattern when seeding from Godot)**: Bleepforge's `Image` field renders flat PNG paths only. Many Godot resources reference an `AtlasTexture` sub_resource — a rectangle inside a sprite sheet — which Bleepforge can't slice on the fly. When seeding Codex (or any image field) from a `.tres` / `.tscn` that uses an atlas region, the workflow is: read the source's `region = Rect2(x, y, w, h)` and source atlas path, crop with PIL (`Image.open(atlas).crop((x, y, x+w, y+h)).save(...)`), and write the standalone PNG into the Godot project alongside the resource that references it (matching the existing per-domain `art/` convention — `shared/components/memory_core/entries/<type>/art/<id>.png`, `world/hazards/<id>/<id>.png`, etc.). Then point the JSON's `Image` at that absolute filesystem path. **For `AnimatedSprite2D` scenes**, parse the `SpriteFrames` resource and pick the right frame: prefer an animation literally named `default`, then `idle`, then the first animation; use that animation's first frame's AtlasTexture region. Static `Sprite2D` scenes just use the single `region` directly. Live atlas-slicing in the asset router was considered (`/api/asset?atlas=...&region=...`) but rejected for v1 — extraction is one-time work, the resulting PNGs are independently useful (Godot can reference them too), and avoiding the schema bifurcation (`Image: string | { atlas, region }`) keeps the editor simple.

## Assets gallery + image editor

The ninth surface, but architecturally a different shape from the seven Godot-mirrored domains AND from Codex. Routed at `/assets`. Read-only browse + cross-system reference search + a writeback editor (crop / bg-remove / tint / flip / auto-trim / Magic crop) that produces PNG bytes. Same editor is mounted inside [AssetPicker.tsx](client/src/components/AssetPicker.tsx) so the field-level image picker (NPC.Portrait, Item.Icon, Faction.Icon/Banner, DialogLine.Portrait, Concept hero images) gets the same right-click → Edit / Duplicate / Delete and `+ Import` + create-folder affordances; saves auto-pick the new file for the field.

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

- Mode-discriminated single component: `import` (fresh source from disk → folder picker + filename → save as new), `edit` (existing asset → save back to same path, overwrite), `duplicate` (existing asset → same folder, new filename → save as new). Sidebar fields adjust per mode (folder picker hidden in edit/duplicate; filename input hidden in edit).
- **Universal launch via singleton.** [imageEditorHost.tsx](client/src/features/asset/imageEditorHost.tsx) ships a `showImageEditor(mode, options?)` imperative API + an `<ImageEditorHost />` component mounted once at the App root, same shape as Modal / Toast / ContextMenu hosts. Any component anywhere in the app launches the editor with one call — no per-page state threading. Optional `onSaved` callback runs on save (used by AssetPicker to auto-pick freshly imported / duplicated files). Host emits a window-level `Bleepforge:image-saved` CustomEvent so any other interested page can refetch (gallery uses this for snappy refresh ahead of the watcher's debounced asset event).
- **Universal click rule + tiered context menu.** Click on any image (`AssetThumb` everywhere it's used, plus the gallery's `AssetCard` / `AssetRow` outer surfaces) opens a **preview** in a new browser tab via `assetUrl(path)` — `window.open(..., "_blank", "noopener,noreferrer")`. Editing is always via right-click. One rule everywhere: click never opens the heavy editor modal accidentally. Right-click menu items are gated by two boolean props on `AssetThumb`:
  - **default** (canEdit + canManage both false): menu = `Preview` only. Used on outer/list pages — NpcCard, FactionCard, QuestCard, BalloonCard, KarmaCard, all the `*Row` siblings, ConceptView, DialogGraph nodes. Click bubbles to the parent's `<Link>` to navigate to the entity edit page; right-click previews. Editing the file isn't the user's primary action on these surfaces.
  - **canEdit=true**: menu = `Edit · Preview`. Used on edit pages (NpcEdit's portrait, FactionEdit's icon, the AssetPicker's text-field thumb). The user is editing the entity → editing the image is on the table; destructive file-system ops (Duplicate, Delete) aren't, since deleting a file from disk would break references to it across the app.
  - **canEdit=true + canManage=true**: menu = `Edit · Duplicate · Delete · Preview`. Reserved for the dedicated image-management surfaces — gallery cards/rows (`/assets`) and the AssetPicker's browse modal file rows (where each row's `<li onContextMenu>` carries the menu since the thumb itself is `editable={false}` so the row's `<button>` can own click=pick).
- One opt-out: `editable={false}` on `AssetThumb` strips both click and right-click handlers entirely. Currently used only by the AssetPicker browse modal's file rows; surrounding `<button>` + `<li>` own click + context-menu themselves.
- stopPropagation on both handlers in `AssetThumb` so the thumb's click doesn't fight a surrounding clickable parent — click on the card body still navigates to the entity, click on the portrait previews the portrait, both work cleanly.
- Gallery `AssetCard` / `AssetRow` keep their own outer click + onContextMenu (mirroring the inner thumb's behavior, but for the whole card surface — `role="button"` + `tabIndex` + Enter/Space keyboard handlers for accessibility). The "used by N" pill `stopPropagation`s so clicking it opens the usages drawer rather than the preview.
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

## In-app Help library

Bleepforge ships its own documentation surface at `/help`. Bleepforge-only (no `.tres` round-trip), with a category → entry shape that mirrors the Codex but pre-baked for prose: each entry carries `Title`, `Section` (free-form grouping label, not a folder layer), `Summary`, `Body`, `Order`, `Tags`, `UpdatedAt`. Schema in [shared/src/help.ts](shared/src/help.ts).

**Storage**: `data/help/<categoryId>/_meta.json` + `<entryId>.json`. Reserved entry ids: `_meta` and `_layout` (server rejects both at the storage boundary). Folder + id validated against `/^[a-zA-Z0-9_-]+$/`.

**Dev-mode gate**: authoring is gated by the `BLEEPFORGE_DEV_MODE` env var, read once at server boot ([server/src/config.ts](server/src/config.ts)) and surfaced via `/api/health` so the client can mirror the gate. When unset (default), GET routes serve content normally but PUT/DELETE return 403, and the client hides edit affordances + 404s on direct-edit-route visits. Defense in depth: server middleware (`requireDevMode` in [server/src/features/help/router.ts](server/src/features/help/router.ts)) plus client-side hiding (via [useDevMode](client/src/lib/useDevMode.ts)) plus route-level NotFound on the Edit components. Set `BLEEPFORGE_DEV_MODE=1` (or `=true`) and restart the server to enable. An env var rather than a Preference because help authoring is a build-time concern and shouldn't be UI-toggleable for end users.

**Body format** is a hand-rolled markdown subset rendered by [client/src/features/help/render.tsx](client/src/features/help/render.tsx): `## h2`, `### h3`, paragraphs, `- bullets`, `1.` ordered lists, `` `inline code` ``, ` ``` ` fenced code blocks, `> note: / > tip: / > warn:` callouts, internal `[label](/route)` and external `[label](https://...)` links, and `:kbd[Ctrl+K]` keyboard chips. ~250 lines, no library. Reasoning: every output element gets pixel chrome (kbd chips, themed callouts, code blocks with the same scrollbar styling) that a markdown library would still need a custom plugin layer to inject.

**Layout**: 2-column grid on `lg+` screens, single column on mobile. Left column is the persistent [HelpSidebar](client/src/features/help/HelpSidebar.tsx) showing every category as a colored stripe with display name + entry count, then entries indented underneath grouped by Section. Active entry highlighted with the category's `bgTint`. Sticky on scroll, scrolls within its own column when overflowing. Same sidebar across List, CategoryView, and EntryView so the navigation model is one thing everywhere — replaces the EntryView's earlier per-category siblings rail.

**Welcome screen** at `/help` is informative rather than expanded-list. Pixel bookshelf hero ([HelpHero.tsx](client/src/features/help/HelpHero.tsx)) with 8 book spines in the 8 palette colors that mirror the sidebar's category tints + a magnifying glass on the bottom shelf + a small potted plant on top — the books literally are the categories visually, the magnifier sells the search affordance silently. Right side carries the title, a one-liner ("A library of how things work in Bleepforge. Pick a topic from the left, or search across every entry below."), a `/` shortcut hint, then the in-page HelpSearch under a "Search" header, a "Start here" row with 3 hand-picked entries (Welcome, Project root, App search and Ctrl K — falls back gracefully if any are missing), and a "Browse by topic" chip grid mirroring the sidebar in compact form (useful on mobile where the sidebar stacks above the content rather than next to it).

**In-page search** at [HelpSearch.tsx](client/src/features/help/HelpSearch.tsx) substring-matches across `Title + Section + Summary + Body`. Distinct from the global AppSearch (`Ctrl+K`), which only indexes `Title + Summary` so help-prose doesn't drown the canonical entity search. Inside Help, the user has already opted into "find help content," so wider coverage is the right tradeoff. Results show a snippet with the matched substring highlighted via `<mark>` and ranked by field priority (title beats summary beats section beats body, then position-based). `/` shortcut focuses the input from anywhere on a Help page (skipped when typing in another input or textarea).

**AppSearch integration**: only the static "Help" page entry (= `/help`) is in the global Ctrl+K palette. Help entries themselves are NOT indexed there — the in-page HelpSearch is the only search that reaches into Help bodies. This is the one place body-text indexing is allowed in Bleepforge; everywhere else the signal-to-noise rule keeps prose out.

**Navbar**: pixel question-mark [HelpIcon](client/src/features/help/HelpIcon.tsx) mounts after the Preferences gear at the right end of the header, sharing the same square icon-button class (`prefsNavClass`) as the gear and Diagnostics icon. No severity tinting — Help is informational, not a state indicator.

**Routes** (in [App.tsx](client/src/App.tsx)):

- `/help` — welcome screen with HelpSidebar + hero + search + Start here + Browse by topic
- `/help/new` — new category form (dev-mode-gated)
- `/help/:category` — category landing (sidebar + entry list grouped by Section)
- `/help/:category/_meta` — edit category schema (dev-mode-gated)
- `/help/:category/new` — new entry form (dev-mode-gated)
- `/help/:category/:id` — entry view (sidebar + rendered body + Prev/Next pager)
- `/help/:category/:id/edit` — edit entry form with live-preview pane (dev-mode-gated)

**Initial seed**: 10 categories, 64 entries. Getting started (red, 5), Editor basics (emerald, 8), Game domains (blue, 6), Dialogs and the graph (cyan, 9), Balloons (pink, 3), Game codex (violet, 4), Assets and image editor (orange, 7), Diagnostics (amber, 7), Under the hood (pink, 8), Shaders (lime, 7). Authored at the level of "what would surprise a new contributor," with cross-links between related entries. The Shaders category landed alongside Phase 4 of the shader work and was the trigger for adding `lime` to the shared palette helper — the 9th color slot, used by the shader category's accent stripe + the AppSearch kind badge + the canvas_item card tint.

**Shared color helper**: the palette helper that was in `client/src/features/codex/categoryColor.ts` moved up to [client/src/lib/paletteColor.ts](client/src/lib/paletteColor.ts) so Codex and Help both consume it. Codex's `categoryColor.ts` is now a thin type-narrowed re-export. Adds a `surface` class (lighter than `bgTint`) for whole-section backgrounds — the only new field over what Codex had. Started at 8 colors; grew to **9** when the Shaders help category landed (lime), with matching additions to `HELP_COLORS` in [shared/src/help.ts](shared/src/help.ts) and `CODEX_COLORS` in [shared/src/codex.ts](shared/src/codex.ts) so the schemas accept the new value — TypeScript flags the missing key on build if any of the three sites drifts.

**No saves-feed integration, no `.tres` round-trip, no watcher hook** — Help is intentionally outside all the Godot-mirrored infra, exactly like Codex and Concept. PUT /api/help/* writes JSON directly; errors surface via the Logs tab (`console.error` capture). The PUT response wraps the entity in `{ entity, tresWrite: { attempted: false } }` for shape-parity with the other domains so the client's `unwrapSavedResponse` adapter doesn't need a special case.

## Shaders surface

The tenth surface, file-based like Assets. The `.gdshader` files in the Godot project ARE the source of truth — no JSON cache, no `.tres` round-trip (shaders aren't `.tres`), no zod schema. Routed at `/shaders` (list) + `/shaders/edit?path=...` (single edit + view page). All three phases are shipped: Phase 1 (browse + usages), Phase 2 (in-app authoring with CodeMirror + SSE), and Phase 3 (GDShader → GLSL ES translator + WebGL2 live preview).

### What's in the surface

- **Browse + view + usages**. The list page surfaces every discovered `.gdshader` as a card or row, with filters (text, shader_type, folder), group-by (folder / shader_type / none), and per-shader "used by N" pills computed eagerly via a single inverted-pass scan. Clicking a card opens the edit page: CodeMirror 6 editor with GDShader syntax highlighting on the left + a sidebar with the metadata strip, the live preview canvas, the auto-generated uniform controls, and the usages list — all stacked in one scrollable column. Usages link back to the relevant Bleepforge edit page (for `.tres`) or surface the scene path (for `.tscn`, non-clickable since we don't author scenes).
- **In-app authoring**. Save (button + Ctrl+S), dirty indicator (amber dot next to filename + "Unsaved" / "Saving…" / "Saved ✓" status pill), delete (with confirmation that surfaces current usage count), duplicate (prompts for new name, server copies current editor contents — not the on-disk version, so in-progress work duplicates as expected). "+ New shader" button on the list opens a modal with a folder picker, filename input, and shader_type select (5 options, defaults to canvas_item); server-side template populates a minimal working shader. Right-click context menu on cards/rows: Open · Duplicate · Delete.
- **Live cross-window sync**. SSE channel at `/api/shaders/events` pushes add / change / remove. The list page refetches on every event. The edit page handles three cases for its currently-open file: silent reload when the local copy is clean; "modified externally" banner when local is dirty (user picks "Reload from disk" or "Keep editing"); "this shader was deleted on disk" banner when removed. The saving window's own save fires a clean-reload no-op via the same event (because dirty=false after the save resolves) — keeps the code path uniform across "your save" / "another window's save" / "Godot saved it" without a self-write suppression escape hatch.
- **Live WebGL2 preview**. The edit page re-translates the GDShader source on every keystroke (150ms debounce) and compiles the result onto a WebGL2 canvas in the right sidebar. The translator targets a defined subset (`canvas_item` only; a fixed set of built-ins and hints — see the translator subset section below); anything outside the subset falls back to a "live preview unsupported" pane with the reason + line number, while the editor itself stays fully functional. Auto-generated uniform controls (sliders for `hint_range`, native color pickers for `source_color`, grouped number inputs for raw vectors, checkboxes for bool) feed values into the runtime; an AssetPicker lets the user swap the bound TEXTURE for any image in the project; the canvas defaults to a procedurally-generated UV-grid + checkerboard pattern so shaders render meaningfully even before the user picks an image.

### Server surface

Routes at `/api/shaders/*` in [server/src/lib/shaders/router.ts](server/src/lib/shaders/router.ts):

- `GET /` — list every shader from the in-memory cache (descriptor only — path, basename, parentRel, UID from `.gdshader.uid` sidecar, parsed shader_type, uniform count, size, mtime). Cache-first; falls back to a fresh walk if the cache is still warming.
- `GET /file?path=...` — full source text + descriptor for one shader. Path-traversal protected (refuses paths outside the Godot project root) and extension-locked (refuses non-`.gdshader` paths).
- `PUT /file` — save source back to disk (atomic temp+rename). Body `{ path, source }`; same path-safety checks as the GET; refuses unknown paths (clients use `POST /new` for new files). Returns the updated descriptor so the client can refresh its local copy without a round-trip GET.
- `POST /new` — create a new shader from a template. Body `{ targetDir, filename, shaderType? }`; appends `.gdshader` if the filename omits it; refuses if the file already exists (409). Templates live in `NEW_SHADER_TEMPLATES` keyed by shader_type — minimal but each one renders cleanly under its corresponding `shader_type` value in Godot.
- `DELETE /file?path=...` — removes the file + its `.gdshader.uid` sidecar (best-effort: missing sidecar is not an error since fresh-out-of-Bleepforge shaders have no sidecar yet).
- `GET /usages?path=...` — reverse-lookup references for one shader. Walks `.tres` + `.tscn` and matches by `res://` path or `uid://`.
- `GET /usage-counts` — `Record<absPath, number>` for every shader in the project, computed via a single inverted-pass walk. Powers the eager "used by N" pills.
- `GET /events` — SSE stream of `{ kind: "added" | "changed" | "removed", path }` events. Fourth SSE channel after sync / saves / assets; popout windows use a same-origin `BroadcastChannel("bleepforge:shaders-relay")` relay rather than opening their own EventSource so the renderer stays under the 6-per-origin HTTP connection cap.

**In-memory cache** in [server/src/lib/shaders/cache.ts](server/src/lib/shaders/cache.ts) mirrors `lib/assets/cache.ts`. Built once at server boot via `rebuildShaderCache()` (called from `app.ts` after the asset cache rebuild, before the watcher starts), kept fresh by the watcher (single-file `upsertShader` / `removeShader`). The list + usage-counts endpoints read from here; the cache earns its keep once SSE-driven cross-window refreshes start firing — without it every event would re-walk the project.

**No self-write suppression** on the shader write path. The watcher upserts the cache + publishes SSE on every `.gdshader` change regardless of who wrote it — keeps other open windows in sync. The saving window's own edit page would see its save echoed back, but the edit page's `useShaderRefresh` callback checks `dirty === false` and does a silent no-op reload in that case (re-fetched content matches what was just saved, so the doc identity doesn't shift). The earlier draft did suppress self-writes via a `selfWrite.ts` map; smoke testing showed it also skipped the cache update + SSE publish, leaving other windows stale, so it was removed in favor of the uniform-flow design.

### Discovery + parser

[server/src/lib/shaders/discover.ts](server/src/lib/shaders/discover.ts) walks the project for `.gdshader` files (skipping dot-dirs to avoid the `.godot` import cache) and reads each one's `.gdshader.uid` sidecar for the UID. **The sidecar shape is different from the `.png.import` sidecars** assets use: it's a single-line file containing just the UID literal (`uid://cm1y1ugdhsajf\n`), not the keyed `uid="uid://..."` form. We try both formats so a future Godot version that switches to keyed form keeps working.

`.gdshaderinc` include files are deliberately skipped: they're support files, not standalone authored shaders, and the translator's `#include` support is out of v1 scope. Surfacing them as cards with no `shader_type` would just confuse the user.

[server/src/lib/shaders/parseHeader.ts](server/src/lib/shaders/parseHeader.ts) is a minimal regex header sniff — extracts the first `shader_type X;` line and counts `uniform` declarations. That's all the descriptor needs. The full GDShader parser (the one driving the Phase 3 translator) will live client-side in `client/src/features/shader/translator/`, since translation only runs in the browser.

### Usage scanning

[server/src/lib/shaders/usages.ts](server/src/lib/shaders/usages.ts) mirrors the assets usage scan but only scans `.tres` + `.tscn` (no Bleepforge JSON files reference shaders — concept.json has image fields, not shader fields). References in this corpus look like:

```text
[ext_resource type="Shader" uid="uid://cm1y1ugdhsajf" path="res://shared/shaders/scanlines.gdshader" id="2_1g8jr"]
```

Most live in `.tscn` (a node's `ShaderMaterial` wraps the shader at scene scope); some in `.tres` (when a `ShaderMaterial` itself is an authored resource). Both formats share the same reference shape, so we scan them together.

### Shared `refScan/` module

The asset-usages scan and the shader-usages scan share five helpers: `walkGodotRefs`, `safeRead`, `pickLine`, `absoluteToResPath`, and the substantive `detectTresDomainAndKey` (40 lines mapping a `.tres` file's `script_class` + id to a Bleepforge edit-page route). Duplicating `detectTresDomainAndKey` would mean two places to fix every time a new authored domain lands. Factored to [server/src/lib/refScan/detectDomain.ts](server/src/lib/refScan/detectDomain.ts) so both consumers share the same source of truth. `assets/usages.ts` and `shaders/usages.ts` now both import from there; the file's `UsageDomain` and `UsageRef` types are also exported from refScan and re-exported by `assets/usages.ts` for back-compat with anything that imports the type from the old location.

### Client surface

- **List page** ([client/src/features/shader/List.tsx](client/src/features/shader/List.tsx)) — cards/list toggle (per-domain `useViewMode("shader")` localStorage), text + folder + shader_type filters, group-by selector. "+ New shader" button in the header opens [NewShaderModal.tsx](client/src/features/shader/NewShaderModal.tsx) (folder picker reuses `features/asset/FolderPicker.tsx`; filename + shader_type form; server template populates the file; navigates straight to the edit page on success). `useShaderRefresh` re-fetches on every SSE event so the list stays live across windows + Godot-side edits.
- **Edit page** ([client/src/features/shader/Edit.tsx](client/src/features/shader/Edit.tsx)) — split layout (`lg:grid-cols-[1fr_22rem]`): CodeMirror editor on the left, sidebar on the right with `ShaderUsagesPanel`. Dirty indicator (amber dot + status pill: "Unsaved" / "Saving…" / "Saved ✓" / "Save failed"). Save button (disabled when clean); Ctrl/Cmd+S keybinding wired through CodeMirror's keymap. Delete button confirms with current usage count; Duplicate prompts for a new name and saves the in-progress editor contents (not the on-disk version). External-change banner appears when SSE pushes a change/remove event for the open file while local is dirty — user picks "Reload from disk" (discard local) or "Keep editing" (next save will overwrite). When local is clean, external changes silently reload.
- **CodeMirror integration** lives in two files: [CodeEditor.tsx](client/src/features/shader/CodeEditor.tsx) is the React wrapper around `EditorView` (uncontrolled doc state pushed up via `updateListener`, external value-prop changes flow back via a doc-replacement transaction guarded by a flag so we don't echo onChange for our own resets, Compartment-driven readOnly toggling so toggling doesn't lose scroll/history). [gdshaderLang.ts](client/src/features/shader/gdshaderLang.ts) is a hand-rolled `StreamLanguage` covering GDShader keywords / types / built-ins / hints / numbers / strings / comments — ~10× less code than a full Lezer grammar and enough for highlight-only (the Phase 3 translator brings its own structural parser). Theme uses CSS variables (`--color-amber-400` for keywords, `--color-cyan-400` for types, `--color-lime-400` for built-ins, `--color-fuchsia-400` for hint annotations) so the editor retints with the rest of the app on a theme swap.
- **Cards + rows** ([ShaderCard.tsx](client/src/features/shader/ShaderCard.tsx) + [ShaderRow.tsx](client/src/features/shader/ShaderRow.tsx)) — no image to preview, so the card's top area is a tinted backdrop with a scanline overlay and the shader_type label centered. Tint comes from the per-shader_type palette in [format.ts](client/src/features/shader/format.ts) (canvas_item → lime, spatial → cyan, particles → orange, sky → blue, fog → slate). Click navigates to the edit page; right-click opens the context menu from [shaderMenu.ts](client/src/features/shader/shaderMenu.ts) (Open · Duplicate · Delete — no separate "Edit" since click already opens; no "Preview" since shaders don't have a meaningful flat preview pre-Phase 3).
- **Pixel scanline overlay** comes from a `repeating-linear-gradient(to bottom, rgba(132, 204, 22, 0.08) 0 1px, transparent 1px 3px)` — same recipe the dialog graph's Terminal nodes use, but resolved through a fixed lime tint since shader cards don't theme-retint per node.
- **Live updates** flow through [lib/shaders/stream.ts](client/src/lib/shaders/stream.ts) (main window opens one EventSource, popouts subscribe to the broadcast-channel relay) and `useShaderRefresh` ([lib/shaders/useShaderRefresh.ts](client/src/lib/shaders/useShaderRefresh.ts)). Same shape as `lib/assets/stream.ts` + `useAssetRefresh`. The renderer's `pagehide` listener in [main.tsx](client/src/main.tsx) explicitly closes the EventSource + relay channel — needed for the Linux/Chromium SIGTRAP fix that also covers the sync / saves / assets streams.

### AppSearch integration

Shaders are indexed by basename-without-extension (`scanlines` finds `scanlines.gdshader`) with the `parentRel` as side context. Catalog integration in [useCatalog.ts](client/src/lib/useCatalog.ts) — the boot fetch parallel includes `shadersApi.list()` with a catch-fallback so a missing endpoint or empty project doesn't take down the rest of the catalog. New kind `"shader"` in [search/buildIndex.ts](client/src/lib/search/buildIndex.ts), lime kind badge in [AppSearch.tsx](client/src/components/AppSearch.tsx) (`border-lime-700/60 text-lime-300`). The lime mirrors the `canvas_item` tint on the gallery cards, so the search-row badge feels like the same surface even before the user opens it.

### Translator subset

The translator's contract is defined declaratively in [translator/subset.ts](client/src/features/shader/translator/subset.ts) — parser.ts + emit.ts both read from it, so adding a built-in or banning a feature is one edit, not three. The subset:

- **shader_type**: `canvas_item` only. Anything else fails with "shader_type X isn't in the v1 translator subset…".
- **Uniform types**: `bool`, `int`, `float`, `vec2`, `vec3`, `vec4`. `sampler2D` is intentionally out — the built-in `TEXTURE` is the only sampler bound by the runtime; extra sampler uniforms would compile but stay unbound, so we reject them at parse time with "Extra sampler2D uniforms ("X") aren't bound to anything in v1 — sample TEXTURE for now."
- **Hints**: `hint_range(min, max[, step])`, `source_color` (aliased `hint_color`).
- **Built-ins emitted as locals in main()**: `TIME` (from `u_time`), `UV` / `SCREEN_UV` (from `v_uv`), `COLOR` (initialized to `vec4(1.0)`, flushed back to `fragColor` at the end), `MODULATE` (constant), `TEXTURE_PIXEL_SIZE` (from `u_texture_pixel_size`), `SCREEN_PIXEL_SIZE` (1.0/`u_resolution`). User references resolve naturally to these locals — no token rewriting needed.
- **Built-ins emitted as substitutions**: `TEXTURE` → `u_texture`, `FRAGCOORD` → `gl_FragCoord`. Two-rewrite list because GLSL ES 3.00 forbids sampler locals and we want `gl_FragCoord` to flow through the native keyword for clarity.
- **Constants**: `PI`, `TAU`, `E` emitted as top-level `const float` in the prelude.
- **Banned features (fail fast with reasoned message)**: `varying`, `hint_screen_texture`, `hint_depth_texture`, `hint_normal_roughness_texture`, `#include`.
- **Known limitation**: user-defined helper functions that reference local-built-ins (UV / COLOR / etc.) won't see them — those live in main()'s scope. The helper would need to take them as parameters. Idiomatic GLSL anyway; documented inline in [translator/emit.ts](client/src/features/shader/translator/emit.ts).

### Translator structure

Four files in [client/src/features/shader/translator/](client/src/features/shader/translator/):

- **subset.ts** — the declarative spec described above. Single source of truth for what the translator accepts.
- **parser.ts** — `parseGdshader(source)` returns `ParseSuccess | ParseFailure`. Strips comments (preserving newlines so line numbers stay aligned), validates shader_type, scans for banned-feature tokens (whole-word match so `varying` doesn't false-positive inside `myvarying_x`), regex-extracts uniform declarations (type + name + hint + default), and finds the `void fragment() { ... }` body via brace matching. NOT a full GLSL parser — for the fragment body we just hand the source to the emitter for verbatim splicing, trusting the WebGL compiler to catch syntax issues we don't. Trade-off: ~150 lines of parser code instead of ~1000, at the cost of slightly less helpful error messages for GLSL-level mistakes — mitigated by surfacing WebGL's own compile-error log with line numbers.
- **emit.ts** — `emitGlsl(parsed)` returns `{ glsl, bodyEmittedLine, bodyRawStartLine }`. Builds a fixed prelude (precision, varying input, output, injected uniforms, constants), emits user uniforms with hints+defaults stripped, opens `void main()`, declares every local-built-in as a `<type> <name> = <init>;` line, splices the user's fragment body verbatim with `TEXTURE`/`FRAGCOORD` substitutions, and closes with `fragColor = COLOR;`. The line offsets (bodyEmittedLine + bodyRawStartLine) let the runtime map WebGL compile-error line numbers back to user-source lines via `mapEmittedLineToUser`.
- **runtime.ts** — `ShaderRuntime` class wraps WebGL2: full-screen quad geometry (one shared VAO + buffer), program management (compile / link / swap on `compile()`), uniform binding (built-ins + user uniforms re-bound every frame so React doesn't have to drive draws), main-texture swap (default UV-grid texture generated procedurally — no asset file shipped), `requestAnimationFrame` loop, explicit `destroy()` for clean GL context release. Compile errors are parsed from the driver's `ERROR: 0:LINE: msg` log format with a tolerant regex and returned with both emitted-line and mapped-user-line so the UI can present whichever's most actionable.

### Preview integration

[features/shader/PreviewPane.tsx](client/src/features/shader/PreviewPane.tsx) is the React shell — owns the uniform-values dict, the picked-texture-path state, the loaded HTMLImageElement, and the compile-error state. Passes everything down to [PreviewCanvas.tsx](client/src/features/shader/PreviewCanvas.tsx) (the runtime wrapper) and [UniformControls.tsx](client/src/features/shader/UniformControls.tsx) (the auto-generated form). Lives in the edit page's right column above the usages panel; the page's parse + emit effect (debounced 150ms) feeds it new `EmitResult` objects whenever the editor content changes.

**Uniform-value persistence across edits**: when the parsed uniform list changes shape (user added/removed/renamed), we preserve values for uniforms whose name + type match and reseed everything else from `uniformDefault()`. So tweaking values mid-edit doesn't reset on every keystroke — they only reset when the relevant declaration changes.

**Default test pattern is procedural** — [runtime.ts](client/src/features/shader/translator/runtime.ts)'s `buildUvGridPixels` generates a 64×64 8-step checkerboard tinted by UV (R = u, G = v, B = 0.5) at module load and uploads it as the initial `u_texture` binding. Shaders that sample TEXTURE see a recognizable checkerboard; shaders that ignore TEXTURE see a UV-tinted backdrop. No bundled binary asset to ship.

**Compile errors surface in the preview pane** as a red banner below the canvas with line-anchored entries (`line 12: 'foo' : undeclared identifier`). The CodeMirror editor doesn't gain markers in v1 — the banner is enough signal for the corpus size, and adding CM marker decoration would mean another integration point per change. Future enhancement if shader-error volume grows.

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
  - Item slugs (TargetItem / Reward.Item) — UID + `res://` path resolved by walking `<root>/world/collectibles/<category>/data/` for a file whose body contains `Slug = "<slug>"`, then reading the matched `.tres`'s `[gd_resource ... uid="uid://..."]` header. The mint emits the actual resolved path (e.g. `res://world/collectibles/keycards/data/rff_keycard.tres`); existing ext_resource dedupe in `findItemExtResourceByUidOrPath` matches by UID first, exact `path` second — UID is Godot's true identity. There's a `findItemExtResourceBySlugBasename` fallback that matches `path.endsWith("/data/<slug>.tres")` for the rare case where slug resolution fails (no .tres found on disk), but the UID path is the load-bearing one. The basename-only assumption was insufficient because at least one item in this corpus has slug ≠ filename basename (`facility_keycard` slug lives in `recycling_facility_keycard.tres`), and a pure basename match would have minted duplicate ext_resources for it.
  - Texture paths (DialogLine.Portrait, Item.Icon, Faction.Icon, Faction.Banner) — UID read from `<png>.import` sidecar via the shared [textureRef.ts](server/src/internal/tres/textureRef.ts) helper. The helper preserves any existing `SubResource` (e.g. `AtlasTexture`) when JSON is empty — Bleepforge doesn't author atlases and shouldn't blow them away on save. When swapping an `AtlasTexture` SubResource for a Texture2D ExtResource, the orphaned AtlasTexture sub_resource is removed so the orphan-ext-resource pass can also clean up its `atlas` ref (the sprite sheet ext_resource).
  - Project scripts (DialogChoice.cs, QuestObjective.cs, QuestReward.cs, NpcQuestEntry.cs, LootTable.cs, LootEntry.cs) — UID found by scanning the project for any other `.tres` that already references the script.

**Reorder-safe via `_subId`:** every sub-resource-backed JSON entry (DialogLine, DialogChoice, KarmaDelta, QuestObjective, QuestReward) carries an optional `_subId` mirroring the Godot sub_resource id. The importer populates it; mappers use it for stable-identity matching across reorder, add, update, and remove. Existing JSON was migrated via `pnpm --filter @bleepforge/server migrate-subids` (idempotent). New entries authored in Bleepforge UI have no `_subId` until first save, when one is minted.

**Save-to-Godot wiring (always on):** the save endpoints — `PUT /api/items/:slug`, `/api/karma/:id`, `/api/quests/:id`, `/api/npcs/:id`, `/api/factions/:id`, `/api/dialogs/:folder/:id`, `/api/balloons/:folder/:id` — first write the JSON cache, then call the matching mapper to update the live `.tres` in `GODOT_PROJECT_ROOT`. Atomic write (temp file + rename). The save response shape is `{ entity, tresWrite }` where `tresWrite` is `{ attempted, ok, path, warnings, error }` — clients can ignore it for now (api.ts logs to console). Server logs every attempt. Since `GODOT_PROJECT_ROOT` is required at boot, `tresWrite.attempted` is effectively always `true` for game-domain saves. Every successful attempt also gets recorded into the Diagnostics → Saves activity feed (see "Saves tab" above).

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
- **Concurrent edit conflict**: if Yehonatan edits the same entity in Bleepforge and in Godot at the same time, the watcher's reimport silently overwrites the in-progress form data when the client refetches. Single-user local workflow makes this rare; future work could surface a "modified externally" banner.

## Open questions

**Schema:**

- Empty `DialogChoice.NextSequenceId` — end conversation, or fall through to next line?
- Conditions / flag *checks* — only `SetsFlag` is visible. Is there a `RequiresFlag` / `ShowIfFlag` mechanism elsewhere, or is gating not built yet?
- Mid-sequence choices — used in practice or only on last line?
- ~~**NPC schema — what file is authored, where do `QuestGiverId` and `TargetId` resolve to?**~~ — resolved. NPCs are authored as `NpcData.tres` (one per NPC, at `characters/npcs/<robot_model>/data/<npc_id>_npc_data.tres`). `Quest.QuestGiverId` is a string ref to `NpcData.NpcId`. `QuestObjective.TargetId` is type-discriminated: a string ref to `NpcId` for `TalkToNpc` / `KillNpc`; a free-form location id (still no schema) for `ReachLocation`; unused for other types. `EnemyType` for `KillEnemyType` is a free-form string.
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
- ~~**Game Codex (Domain 8)**~~ — done. Bleepforge-only multi-category authoring surface for project-specific concepts that don't fit a hardcoded domain. User defines categories with custom property schemas (text / number / boolean / image / FK ref / tags); entries are pure JSON, never round-tripped to Godot. Per-category color, dynamic edit form driven by `_meta.json`, two-layer validation (structural + FK existence), full app-search + integrity integration. See "Domain 8 — Game Codex" above.
- ~~**Shaders surface (Phase 1 — browse + view + usages)**~~ — done. Tenth surface, see the dedicated section above. File-based like Assets — `.gdshader` IS the source of truth, no `.tres` round-trip. List page with cards/rows + per-shader_type tinted cards, view page with monospace source + inline cross-system usages panel, lime kind in AppSearch, `detectTresDomainAndKey` factored to `lib/refScan/` so assets + shaders share the domain-routing logic.
- ~~**Shaders Phase 2 (authoring)**~~ — done. PUT / POST / DELETE endpoints with atomic writes; in-memory cache; watcher extended to pass `.gdshader` through with cache update + SSE publish; CodeMirror 6 editor with hand-rolled GDShader StreamLanguage highlighting; dirty indicator + save (button + Ctrl+S); "+ New shader" modal with folder picker + filename + shader_type select; right-click context menu (Open / Duplicate / Delete); external-change banner on the edit page when the watcher pushes a change to the open file while local is dirty. SSE channel `/api/shaders/events` becomes the fourth (after sync / saves / assets), still well under the 6-per-origin HTTP connection cap.
- ~~**Shaders Phase 3 (live WebGL preview)**~~ — done. GDShader → GLSL ES subset translator at [translator/](client/src/features/shader/translator/) (subset.ts spec + parser.ts + emit.ts + runtime.ts), WebGL2 canvas + procedurally-generated UV-grid default texture, auto-generated uniform controls (SliderField for `hint_range`, native color picker for `source_color`, grouped number inputs for raw vectors, checkbox for bool), AssetPicker swap for the bound TEXTURE, live re-translate on 150ms-debounced editor changes, translator/compile errors surfaced in a red banner under the canvas with line-anchored entries (user-source line numbers mapped from emitted-GLSL line numbers via the emitter's source-map fields).
- **Shaders Phase 4+ (deferred)** — extra sampler2D uniforms with per-uniform AssetPicker bindings (multi-texture support); helper-function aware translation (currently user-defined helpers can't see local-built-ins like UV without taking them as parameters); CodeMirror gutter markers for compile errors (currently surfaced only in the banner); `varying` support if we ever build a vertex pipeline; spatial / particles shader types.
- ~~**Wrap with Electron (Phase 1 — dev window)**~~ — done. `pnpm dev:desktop` runs server + client + electron in parallel, the desktop window loads `http://localhost:5173`, HMR + SSE + TS strict mode all preserved.
- ~~**Wrap with Electron (Phase 2 — Linux AppImage)**~~ — done. `pnpm dist` produces a single self-contained `Bleepforge-<v>-x86_64.AppImage` (~115MB) that runs without sudo on Fedora 44 / KDE / Wayland. Server bundle (esbuild, ~211KB) + client bundle (Vite) + Help library seed all ride inside `app.asar`; user state lives outside in `~/.config/Bleepforge/data/`. macOS (.dmg) / Windows (NSIS) targets are a config-only follow-up — the build pipeline is platform-generic. Auto-update + code signing are deferred until distribution is something other than "the user runs the AppImage from disk." See "Electron desktop wrap" below for the packaging architecture and the five Linux-specific landmines we hit (workspace dep resolution, sandbox flag conflict, /dev/shm, asar fs.cpSync, asar+send).
- **Genericize for any Godot project** (post-1.0, future direction) — Bleepforge currently ships hardcoded against Flock of Bleeps' seven domain schemas + per-domain edit forms + per-domain `.tres` mappers. The bones are project-agnostic: `.tres` parser / emitter / writer / watcher, JSON CRUD machinery, asset surface, diagnostics shell, UI primitives, theming, the three SSE infrastructure channels — none of those know anything about this specific game. The schema layer is the only project-specific code (seven zod schemas in `shared/src/`, the per-domain mappers under `server/src/internal/tres/domains/`, the hand-coded edit forms in `client/src/features/<domain>/`, plus the dialog-specific graph view). Genericization path: make the schema layer runtime-configurable, ideally by reading the user's project's `[GlobalClass]` resource types directly to auto-generate forms / integrity checks / a configurable graph view that recognizes any "next"-style reference. Coupling is by configuration, not by architecture — that's why the lift is reasonable.
- v1 polish on existing UIs (deferred — Yehonatan: "we'll polish with time").

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
                catalog-bus.ts, plus five plumbing subfolders:
                  lib/sync/      SSE client + useSyncRefresh + useSyncToasts
                  lib/saves/     saves SSE stream + route mapping
                  lib/assets/    asset-events SSE stream + useAssetRefresh
                  lib/shaders/   shader-events SSE stream + useShaderRefresh
                  lib/integrity/ computeIssues pure function
  features/     user-facing pages, one folder per domain — asset, balloon,
                concept, dialog, diagnostics, faction, item, karma, npc,
                preferences, quest, shader. Each holds Edit.tsx + List.tsx
                + (where relevant) Card.tsx / Row.tsx / domain-specific
                helpers. features/asset/ also ships the image editor itself
                (ImageEditor + CropCanvas + CropControls + FolderPicker +
                imageOps + cropMath + UsagesDrawer + useAssetMenu).
                features/shader/ holds List + Edit (CodeMirror editor +
                live preview) + ShaderCard + ShaderRow + UsagesPanel +
                CodeEditor + gdshaderLang + NewShaderModal + shaderMenu +
                format + PreviewCanvas + PreviewPane + UniformControls,
                plus a translator/ subfolder (subset + parser + emit +
                runtime) that handles the GDShader → GLSL ES translation
                and WebGL2 lifetime.
  App.tsx       entry component — header nav, routes, mounts the singleton
                hosts (ModalHost, ToastHost, ContextMenuHost,
                ImageEditorHost, CatalogDatalists)
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
                 lib/refScan/       cross-system reference helpers shared
                                    by lib/assets/ + lib/shaders/ —
                                    detectTresDomainAndKey + walk +
                                    safeRead + pickLine + UsageRef types
                 lib/saves/         buffer + bus + SSE router
                 lib/shaders/       .gdshader gallery + authoring surface
                                    (/api/shaders/*) — discover.ts walks
                                    for .gdshader files + .gdshader.uid
                                    sidecars, parseHeader.ts sniffs
                                    shader_type + uniform count,
                                    usages.ts mirrors the assets ref
                                    scan over .tres + .tscn, cache.ts
                                    holds the in-memory Map kept fresh
                                    by the watcher, eventBus.ts + the
                                    SSE endpoint on router.ts ship
                                    add/change/remove events. Phase 3
                                    adds the translator (client-side
                                    only — server stays read+write
                                    bytes-of-text-only)
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

## Electron desktop wrap

A fourth workspace package — [electron/](electron/) — wraps Bleepforge as a desktop app. The renderer is the same React app loaded over HTTP from Vite (dev) or served from in-process Express (prod); the rest of Bleepforge — server, watcher, diagnostics, SSE channels, every Express route — is unchanged.

```text
electron/
  package.json            CJS package; depends on express/chokidar/zod for asar bundling
  tsconfig.json           module=node16, target=ES2022, outDir=dist
  electron-builder.json   packaging config (separate from package.json — see "extraMetadata
                          stomps the source" landmine below)
  src/
    main.ts               BrowserWindow + dev/prod URL switch + in-process server boot
    preload.ts            window.bleepforge.popout(routePath) bridge
  scripts/
    dev.mjs               waits for Vite at :5173, then spawns Electron
    dist.mjs              orchestrates client build + server esbuild + electron tsc + builder
  dist/                   tsc output (main.js, preload.js, sourcemaps)
  release/                electron-builder output (gitignored — ~400MB per build)
```

**Why Electron, not Tauri.** Tauri runs Rust on the host and a webview as the UI; the server would have to live as a sidecar child process. Electron's main process *is* Node, so Express boots in-process via dynamic `import()` of the esbuild-bundled server. For Bleepforge — which has a watcher, atomic file writes, an in-memory image-asset cache, and three SSE channels all rooted in Node — that's the difference between "wrap" and "rewrite the integration layer." The Chromium bundle weight (~150 MB → ~115 MB compressed in the AppImage) is the trade.

**CJS for the main process, ESM everywhere else.** The rest of the workspace is `"type": "module"`. Electron's main does `module=node16` (which compiles to CJS for non-`type:module` packages). ESM in Electron's main exists from v28+ but has rough edges; CJS is what every electron-builder template, every plugin, and every doc still assumes. The CJS↔ESM bridge for the in-process server uses a `Function` constructor wrapper around `import()` — without it, tsc with `module=commonjs` (the de-facto config for electron mains) compiles `await import(...)` into `require(...)`, which can't load `.mjs`. The wrapper hides the call site from tsc so the real dynamic `import()` survives. The renderer is invisible to this — it's just Chromium loading the React app from Vite or in-process Express.

**Security defaults.** `sandbox: false`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`. Sandbox-false at the BrowserWindow level matches the global `app.commandLine.appendSwitch("no-sandbox")` we set at module load — without that match, the renderer SIGTRAPs during init on Linux because Chromium gets conflicting `--enable-sandbox --no-sandbox` flags from the BrowserWindow's per-renderer flag plus our global switch (the conflicting-flag handling on Chromium 130 is buggy). We still get V8 / IPC isolation from `contextIsolation: true` and `nodeIntegration: false`, which is the security boundary that matters for a tool that only loads its own localhost renderer URL. `setWindowOpenHandler` routes `target=_blank` clicks to the system browser via `shell.openExternal` rather than opening a child Electron window. The preload exposes one bridge — `window.bleepforge.popout(routePath)` — via `contextBridge.exposeInMainWorld`. That's the only IPC surface today; new IPC channels (native menus, OS file dialogs) would join it here.

**Window mode + menu.** Main window opens at **splash size first** (640×520, centered, `resizable: false`, `maximizable: false`, `fullscreenable: false`) so the OS window matches the splash card while the user reads it. On the splash's CONTINUE click, the renderer fires an `app:reveal` IPC → main process re-enables resize/maximize/fullscreen, sets `minSize` to 800×600, calls `win.maximize()`, and (in dev) opens DevTools detached. DevTools auto-open is deliberately deferred to reveal because opening it next to a 640×520 window puts the detached DevTools beside a tiny app, which looks wrong. From reveal onward the window behaves exactly like the previous always-maximized model. Maximized rather than `fullscreen: true` for the same reasons as before: literal fullscreen on Linux WMs hides the title bar and breaks Alt+Tab on some compositors; maximized fills the screen with normal window-management still working. The OS application menu is removed globally with `Menu.setApplicationMenu(null)` on `app.whenReady`, so every window (main + popouts) shows only the WM's native close/min/max controls — no `File / Edit / View` menu strip. `autoHideMenuBar: true` on popouts is belt-and-braces for the same goal.

**Popouts (Diagnostics / Help / Preferences).** These three icons in the main window's header rewire to a `popout(path)` IPC call when running in Electron, opening a chromeless secondary window for that route instead of navigating in place. The renderer-side helper [client/src/lib/electron.ts](client/src/lib/electron.ts) reads `window.bleepforge?.popout` as the "we're in Electron" marker; in browser mode the bridge is absent and the existing `<NavLink>` `to=` handles navigation as before. The popout URL is `<devUrl><path>?popout=1` — the `?popout=1` flag is read **once at module load** in [client/src/lib/electron.ts](client/src/lib/electron.ts), so the chromeless layout sticks for the window's lifetime even when in-popout `<Link>` navigation drops the query (e.g. clicking a Help internal link inside a Help popout). When `?popout=1` is set, [App.tsx](client/src/App.tsx) renders the routes block without the app `<header>` (nav + search + diagnostics/prefs/help icons) and without the `<Footer />` (credit line). The `SplashScreen` is also skipped in popouts — they're focused subviews, not full sessions. Per-route popout sizes live in `POPOUT_SIZES` in [main.ts](electron/src/main.ts) — Diagnostics 1100×750, Help 1100×800, Preferences 720×800; default 900×700 for any path that doesn't match. Window dedup: [main.ts](electron/src/main.ts) keeps a `Map<path, BrowserWindow>` so a second click on the same icon focuses the existing popout (un-minimizing if needed) instead of stacking duplicates. On window-`closed` the entry is dropped and the next click creates a fresh one. **Closing the main window closes every popout first** — the main window's `close` listener iterates the `popouts` Map and calls `close()` on each before its own teardown completes. Popouts are conceptually children-of-main (they can only be opened from the main header's icons), so leaving them as orphans would just stall app quit and confuse the user.

**Soft theme-aware window edge.** [client/src/styles/index.css](client/src/styles/index.css) sets `outline: 2px solid var(--color-emerald-700); outline-offset: -2px` on `body` — visible edge inside the WM's window frame, retints automatically per theme via the `--color-emerald-*` re-pointing in each `[data-theme="..."]` block. Used `outline` rather than `border` deliberately: `border` would consume 4px of layout, pushing the App's `h-screen` content past `body`'s content area and producing a second scrollbar on `body` alongside the inner `<main>`'s own overflow. Outline doesn't affect flow.

**Cross-window state sync** lives in [client/src/styles/GlobalTheme.tsx](client/src/styles/GlobalTheme.tsx) via a same-origin `BroadcastChannel("bleepforge:preferences")`. Every Bleepforge window subscribes at module load; whoever calls a wrapped setter (`setActiveColorTheme`, `setActiveFont`, `setActiveFontSize`, `setActiveLetterSpacing`, `switchGlobalTheme`, etc.) goes through `persist()` which posts the full `Preferences` doc on the channel. Receivers feed the payload through `PreferencesSchema.safeParse` and call `adopt()` to apply DOM (`applyToDom` → `setTheme` / `setFont` / `setFontSize` / `setLetterSpacing`) and update the cache. A `receivingBroadcast` flag short-circuits `persist()`'s rebroadcast so the sync doesn't loop. Result: a theme change in the Preferences popout updates the main window in the same paint, and vice versa. Why BroadcastChannel over Electron IPC: it's a same-origin browser standard, works identically in dev (browser tabs of the same origin) and in Electron, and doesn't require a preload bridge or main-process broker. Why through `persist()` (not at the wrapped-setter layer): every mutation already funnels through `persist()` to write the cache and queue the server save — broadcasting from the same point keeps the three persistence channels (memory, cache, server, peers) in lock-step. The PUT itself uses `fetch(..., { keepalive: true })` ([client/src/lib/api.ts](client/src/lib/api.ts) `preferencesApi.save`) so the request survives the renderer process being terminated mid-save — without that flag, closing the Preferences popout right after a theme change killed the in-flight PUT, the server kept the stale value, and the next `initAsync` reconcile overwrote the cache with that stale value, flipping the just-applied change back. The Preferences doc is well under the 64KB keepalive body limit.

**Restart icon (Electron only).** A fourth header icon at the right end of the strip — pixel-art [RestartIcon](client/src/components/RestartIcon.tsx). A hook-shaped arrow (↰): horizontal tail entering from the right, 90° elbow at the bottom-left, vertical shaft going up, arrowhead at the top — reads as "loop back to the start." 12×12 grid, single fill `currentColor`, `shapeRendering="crispEdges"`, matching the gear / waveform / question-mark icons it sits next to. Click → confirm modal → `window.bleepforge.restart()` → main process `app.relaunch() + app.exit(0)`. Exists because the Godot project root is captured once at server boot (and any future per-domain folder overrides will be too), so changing it via Preferences requires a fresh server. Before this icon the only "restart" affordance was "quit the AppImage, reopen by hand." Browser mode hides the button via `isElectron()` — no useful restart action when the server is launched independently. The IPC handler `app:restart` lives in [main.ts](electron/src/main.ts); the bridge in [preload.ts](electron/src/preload.ts) exposes `restart()` alongside `popout()` on `window.bleepforge`. The confirm modal exists because the restart is destructive of unsaved form state — same UX bar as any other action that throws away work.

**SSE relay (one connection per origin, not per window).** Each window opens 3 EventSources by default (`/api/sync/events`, `/api/saves/events`, `/api/assets/events`); browsers cap concurrent HTTP/1.1 connections at 6 per origin. Main + one popout = 6, at the cap, and any extra fetch (`helpApi.listAll()`, Diagnostics tab data, etc.) queues forever behind the SSEs. Symptom before the fix: Help / Diagnostics popouts hung on "Loading…" indefinitely and got zero live events. **Fix**: only the main window opens EventSources; each `connect()` callback in [stream.ts](client/src/lib/sync/stream.ts) / [saves/stream.ts](client/src/lib/saves/stream.ts) / [assets/stream.ts](client/src/lib/assets/stream.ts) `postMessage`s the parsed event onto a per-channel `BroadcastChannel` (`bleepforge:sync-relay` / `bleepforge:saves-relay` / `bleepforge:assets-relay`). Popout-side `start*Stream` checks `isPopout()`: if true, it subscribes to the relay channel and re-dispatches the same `Bleepforge:sync` / `Bleepforge:save` / `Bleepforge:asset` `CustomEvent` it would have dispatched from a real EventSource — so consuming components are unchanged across window types. Total origin connections drop back to 3 regardless of how many popouts are open. Edge cases: if main is closed, popouts go silent (acceptable — popouts close-on-main-close anyway). If a popout opens before main has emitted anything, it just receives subsequent events.

**Autofill DevTools noise.** Chromium 130 (Electron 33's bundled engine) probes `Autofill.enable` / `Autofill.setAddresses` CDP methods whenever DevTools is open; Electron doesn't implement those handlers, so DevTools logs `'Autofill.X' wasn't found` errors to stderr — harmless but loud. The errors come from DevTools' protocol client itself (devtools://devtools/bundled/core/protocol_client/protocol_client.js), not from Chromium's autofill subsystem, so disabling features via `app.commandLine.appendSwitch("disable-features", "Autofill,...")` doesn't quiet them — that switch is left in place defensively in [main.ts](electron/src/main.ts) but the actual silencing happens at the dev launcher: [scripts/dev.mjs](electron/scripts/dev.mjs) pipes electron's stdout/stderr through `readline` and drops lines matching `Request Autofill\.(enable|setAddresses) failed` / `'Autofill\.(enable|setAddresses)' wasn't found`. The `NOISE` regex list is intentionally narrow so real errors stay visible — add patterns there as new noise classes surface.

**Dev-mode boot flow** (`pnpm dev:desktop` at root):

1. Root script runs `pnpm --parallel --filter @bleepforge/server --filter @bleepforge/client --filter @bleepforge/electron run dev` — same shape as plain `pnpm dev`, just with the electron filter added.
2. `client` runs `vite` on :5173, `server` runs `tsx watch src/index.ts` on :4000 — both unchanged.
3. `electron`'s dev script does `tsc && node ./scripts/dev.mjs`. The compile step finishes in <500ms (two tiny files); the launcher then polls `http://localhost:5173` until any HTTP response comes back, with a 60s timeout (default `POLL_INTERVAL_MS = 250`).
4. When Vite is ready, the launcher reads the Electron binary path via `require("electron")` (the package's `main` is a string path to the platform binary) and spawns it with `BLEEPFORGE_ELECTRON_DEV=1` and `VITE_DEV_URL=http://localhost:5173` in the env.
5. `main.ts` reads those env vars: dev mode loads `VITE_DEV_URL`, opens DevTools in a detached window, and shows the native menu bar (so File→DevTools-toggle stays handy). Prod hides the menu by default (`autoHideMenuBar: !isDev` — Alt reveals it).

**Prod-mode boot flow** (`pnpm dist` produces the AppImage; double-click to run it):

1. Electron main loads (CJS, sandbox-disabled via `app.commandLine.appendSwitch("no-sandbox")` at module init).
2. `app.setName("Bleepforge")` so the userData path lands at `~/.config/Bleepforge/` instead of `~/.config/@bleepforge/` (which is what the package's npm name `@bleepforge/electron` would otherwise produce).
3. `app.whenReady` fires → `startServerInProcess()`:
   - Sets `DATA_ROOT=<userData>/data`, `BLEEPFORGE_CLIENT_DIST=<asar>/client/dist`, `BLEEPFORGE_SEED_ROOT=<asar>/seed`, `PORT=0` (random free port).
   - Dynamic-imports `<asar>/server/dist-bundle/server.mjs` and awaits `startServer()`.
   - Server seeds the help library (`<seedRoot>/help → <dataRoot>/help` if dest is empty), then boots Express, listens on PORT=0, reads the actual OS-assigned port from `httpServer.address()`, returns `{ url: http://localhost:<port> }`.
4. Main window loads that URL. Express serves both `/api/*` and the SPA bundle from the same origin — the renderer talks to its in-process backend via `fetch("/api/...")` exactly like the browser version, no port-discovery needed in the renderer.

The path resolution in `main.ts` branches on `app.isPackaged`: packaged means `__dirname` is inside `app.asar/dist/` so siblings are reached via `..` (one level up to asar root); unpackaged dev means `__dirname` is `electron/dist/` and siblings need `../..` (two levels up to the workspace root).

**The dist orchestration script** ([electron/scripts/dist.mjs](electron/scripts/dist.mjs)) runs four steps in sequence: (1) `pnpm --filter @bleepforge/client run build` (Vite → `client/dist/`); (2) `pnpm --filter @bleepforge/server run build:bundle` (esbuild → `server/dist-bundle/server.mjs`); (3) `pnpm --filter @bleepforge/electron run build` (tsc → `electron/dist/`); (4) `pnpm exec electron-builder --config electron-builder.json`. Step (2) is the load-bearing one — see "esbuild bundle" below.

**esbuild bundle for the server.** [server/package.json](server/package.json) ships a `build:bundle` script: `esbuild src/lib-entry.ts --bundle --platform=node --format=esm --target=node20 --external:express --external:chokidar --external:zod --outfile=dist-bundle/server.mjs`. Why bundle instead of plain tsc: `@bleepforge/shared` exports `./src/index.ts` directly (its `main` field), which works in dev (Vite + tsx both load TS via their bundler-style resolution) but fails at runtime under plain Node — Node sees `main: ./src/index.ts`, tries to load that, and chokes on `import` syntax. esbuild bundles the workspace deps inline (so the runtime sees one self-contained `.mjs` with no `@bleepforge/shared` import to resolve) while keeping express / chokidar / zod external (those resolve normally from the asar's `node_modules/`). The bundle is ~211KB. The entry point [server/src/lib-entry.ts](server/src/lib-entry.ts) exists separately from `index.ts` because index.ts is the dev CLI that calls `startServer()` at module load (auto-start) — the bundle needs to *export* `startServer` for Electron main to await, not call it. lib-entry installs the log-capture monkey-patch and re-exports startServer; nothing more.

**Server boot decoupled from CLI fail-fast.** [server/src/app.ts](server/src/app.ts) holds `startServer()` (composer); [server/src/index.ts](server/src/index.ts) is the dev CLI entry that fail-fast-exits on missing Godot project root *before* calling startServer. The packaged path bypasses index.ts — Electron main imports lib-entry.ts directly, which re-exports startServer without the fail-fast guard. The packaged server runs in **limp mode** when no Godot root is configured: it still listens (so the Preferences UI can collect a root), reconcile / asset-cache / watcher all skip, and the user is expected to set the root via Preferences and restart. Without limp mode, a fresh AppImage install with no preferences.json would `process.exit(1)` and the user would see no window at all — no terminal to read the error from.

**electron-builder config in a separate file.** Config lives in [electron/electron-builder.json](electron/electron-builder.json), not in `package.json`'s `build` field. We had to move it: when `build.extraMetadata` is set in package.json, electron-builder rewrites the source `package.json` in place during packaging, stripping `scripts` + `devDependencies` and producing the trimmed prod metadata as the on-disk file. (Almost certainly a bug — extraMetadata should overlay the *built* package.json inside asar, not the source.) Keeping config in a separate JSON sidesteps the issue entirely. The script in [electron/scripts/dist.mjs](electron/scripts/dist.mjs) passes `--config electron-builder.json` explicitly so there's no ambiguity.

**asar layout** (`pnpm dist` produces this inside `release/linux-unpacked/resources/app.asar`):

```text
app.asar/
  dist/main.js              electron main (entry — path in extraMetadata.main)
  dist/preload.js           contextBridge bridge
  package.json              trimmed prod metadata (name=bleepforge, deps only)
  server/dist-bundle/server.mjs   esbuild output, exports startServer
  client/dist/              Vite output (index.html + assets/*)
  seed/help/                Help library bundled inside the AppImage
  node_modules/             express + chokidar + zod (the externals)
```

Build artifacts NOT in the asar: the workspace's `data/` (per-user state lives outside, in `~/.config/Bleepforge/data/`), the seven Bleepforge-only domain JSONs (concept, codex, preferences, etc. — those start empty on a fresh install and are user-authored), and source TypeScript (only built outputs ship).

**userData layout** (`~/.config/Bleepforge/`):

```text
~/.config/Bleepforge/
  boot.log                  per-launch trace (whenReady → server up → window created)
  data/
    preferences.json        godotProjectRoot + theme settings
    concept.json            user's project pitch
    codex/<category>/...    user-authored Codex categories
    help/<category>/...     seeded from <asar>/seed/help on first launch when empty
    dialogs|quests|items|karma|npcs|factions|balloons/   .tres-derived JSON cache
  Cache/, Cookies, blob_storage/, Crashpad/   Electron + Chromium internals
```

The userData path resolves correctly because `app.setName("Bleepforge")` runs at module load *before* anything calls `app.getPath("userData")` — Electron caches the path on first access, so setName has to win the race. We pass DATA_ROOT to the server via env so its existing `config.ts` (which already reads DATA_ROOT) just works without any per-mode branching.

**Help library seeding.** [server/src/app.ts](server/src/app.ts) ships `seedHelpLibrary()`: if `BLEEPFORGE_SEED_ROOT/help` exists and `<dataRoot>/help` is missing or empty, copy the tree. We use a manual `readdirSync + copyFileSync` recursion rather than `fs.cpSync` because cpSync uses `fs.opendirSync` internally, which doesn't work inside Electron's asar polyfill (ENOTDIR on every directory). The seed is idempotent and skips when the user already has help content — so subsequent launches don't overwrite their edits. Concept, Codex, and the .tres-derived domain JSONs are *not* seeded — those are user-authored content.

**SPA fallback bypasses Express's `send` library.** Express's `res.sendFile()` uses the `send` package, which fails with `NotFoundError: Not Found` when called against an asar path (`send`'s internal stat lookup doesn't go through Electron's asar polyfill cleanly). Symptom: the main window's `/` worked because it hit `express.static` directly, but every popout's `/diagnostics`, `/help`, `/preferences` returned 500 and the BrowserWindow stayed black (its native `backgroundColor: "#0a0a0a"`). **Fix**: read `index.html` once at startup into a string, and serve it directly via `res.type("html").send(html)` — bypasses send entirely. The HTML is <1KB, so caching it in memory is cheaper than re-resolving per request anyway.

**The six Linux landmines.** Documented here so future-you knows what's expected vs broken:

1. **Workspace dep resolution** — pnpm-isolated `@bleepforge/shared` exports `.ts` source via `main`, which Node can't load. Fix: esbuild bundle inlines workspace deps, externalizes npm deps. See "esbuild bundle for the server" above.
2. **Sandbox flag conflict** — Chromium 130 SIGTRAPs the renderer when `--enable-sandbox` (auto-added by the BrowserWindow per-renderer) and `--no-sandbox` (our global switch) both appear. Fix: set `webPreferences.sandbox: false` to match. See "Security defaults" above.
3. **/dev/shm refusal** — on Fedora 44 the renderer fails init with `Creating shared memory in /dev/shm/...: No such process (3)` despite `/dev/shm` being world-writable. Standard Docker/CI fix: `app.commandLine.appendSwitch("disable-dev-shm-usage")`. (We set it defensively but on this user's box the renderer cleared init without it after the sandbox fix landed; harmless either way.)
4. **`fs.cpSync` inside asar** — fails with ENOTDIR on `opendirSync`. Fix: manual `readdirSync` + `copyFileSync` recursion. See "Help library seeding" above.
5. **Express's `send` lib inside asar** — `res.sendFile` returns 500 NotFoundError for any asar-rooted file. Fix: in-memory string for the SPA fallback's `index.html`. See "SPA fallback bypasses send" above.
6. **Renderer SIGTRAP on window close from forced channel cleanup** — Bleepforge holds long-lived globals in the renderer that Chromium has to cleanup when the renderer process is killed: 3 `EventSource` instances (sync / saves / assets — main window only), 3 SSE-relay `BroadcastChannel` instances (`bleepforge:sync-relay` / `bleepforge:saves-relay` / `bleepforge:assets-relay` — both main and popouts), and 1 theme-sync `BroadcastChannel` (`bleepforge:preferences` — all windows). When Electron tears down the renderer, Chromium 130 / Linux trips a `CHECK` in the resource cleanup path during forced channel teardown, producing a SIGTRAP coredump (visible to the user as a desktop-environment "encountered a fatal error" notification, even though the app exits cleanly). Fix: register a `pagehide` listener in [main.tsx](client/src/main.tsx) that calls `closeSyncStream` / `closeSavesStream` / `closeAssetStream` / `closeGlobalThemeChannel` — each of these explicitly `.close()`s the channel + EventSource references it holds, so Chromium gets clean state and skips the forced-cleanup path. `pagehide` over `beforeunload` because the latter has "ask user to confirm" semantics; we only need to release resources.

There's a *seventh* landmine adjacent to packaging: **electron-builder's `extraMetadata.name` rewrites the source package.json in place** (mentioned above). Cure: keep build config in `electron-builder.json`, not in the package's `build` field.

**Tearing down the dev session.** Closing the Electron window exits the launcher with the electron exit code. The `pnpm --parallel` runner keeps the Vite + Express child processes alive — Ctrl+C in the terminal kills them. That's intentional for v1: an automatic teardown could mask unrelated failures (e.g. the watcher errored), and the existing `pnpm dev` flow already trains the user on Ctrl+C-to-stop. The packaged AppImage owns its own lifecycle — the in-process Express dies when Electron quits.

**Port collision footgun.** The launcher's Vite probe is hardcoded to `http://localhost:5173`. If you have a stray `pnpm dev` already running in another terminal, Vite shifts to :5174 and the launcher's probe still hits :5173 (the older session) — the desktop window then loads the *wrong* React app, which talks to its own Express on :4000, which is whichever started first. The cure is "kill any running dev session before `pnpm dev:desktop`." Override via `VITE_DEV_URL=http://localhost:5174 pnpm dev:desktop` if you really do want to wrap an already-running session.

**pnpm v10 build-script approval.** Electron's postinstall downloads a ~150 MB Chromium binary; pnpm v10 ignores postinstalls by default for security. Bleepforge's root [package.json](package.json) lists `"pnpm": { "onlyBuiltDependencies": ["electron"] }` to permit this. After `pnpm install`, the binary lands under `node_modules/.pnpm/electron@<v>/node_modules/electron/dist/electron`. If `pnpm install` skips the postinstall (older lockfile, npmrc override, etc.), `cd` into the electron-versioned `.pnpm` directory and run `node install.js` — the script pulls the right Chromium build for your OS / arch from electron's GitHub releases and exits.

**TypeScript strict mode preserved.** `electron/tsconfig.json` extends none of the others (its module/target story is different — CJS vs the project's ESM) but mirrors the strictness flags from [tsconfig.base.json](tsconfig.base.json) — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `forceConsistentCasingInFileNames`. `pnpm typecheck` at root runs `tsc --noEmit` across all four packages (shared, server, client, electron). `pnpm build` runs `tsc` (electron emits to `dist/`) alongside the existing client + server build steps.

## Collaboration

Per Yehonatan's global CLAUDE.md: docs are built together, I'm expected to have opinions and push back. This file evolves as we learn — not a static spec.
