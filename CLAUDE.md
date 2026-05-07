# Bleepforge

**A graph-based project organizer / planning tool** for Yonatan's Godot game **Flock of Bleeps** (formerly placeholder "AstroMan" — the C# namespace and project folder still use the old name). Visualizes and documents **dialogues** (the headline feature: a graph view), plus **quests**, **items**, **karma impacts**, **NPCs**, and **factions**. Also serves as the project bible — see [data/concept.json](data/concept.json) for the canonical pitch, acts structure, and faction roles.

**Two-way editor with `.tres` as canonical.** The Godot `.tres` files are what the game runtime loads, so they stay canonical: anything that ships is what's in `astro-man/`. Bleepforge's JSON in `dialoguer/data/` is a working copy. When `WRITE_TRES=1` is set, every save in Bleepforge also pushes the edit into the matching `.tres` (atomic write). The read direction (`.tres` → JSON) is **not** auto-sync — it still runs through the Preferences page's *Import from Godot* section on demand, which doubles as the recovery path if Bleepforge's JSON drifts from Godot.

**Godot project on disk**: `/home/ymoravia/Data/Projects/Godot/astro-man/`. Bleepforge writes here only on save when `WRITE_TRES=1`, and only to `.tres` files we've already mapped. Defense in depth: the writer refuses any target outside `GODOT_PROJECT_ROOT`. The schema sections below mirror the Godot Resource fields 1:1 so the mappers can apply JSON edits to the corresponding `.tres` properties.

## Stack

- **Frontend**: React + TypeScript + Tailwind + Vite
- **Backend**: Express + TypeScript
- **Persistence**: JSON files at `dialoguer/data/{dialogs,quests,items,karma,npcs}/`, one file per entity

## v1 plan (decided)

**Scope** — six data domains (Godot-mirrored) plus a Bleepforge-only concept doc:

1. Dialogs (`DialogSequence` / `DialogLine` / `DialogChoice`) — **CRUD + interactive graph view + multi-folder implemented**
2. Quests (`Quest` / `QuestObjective` / `QuestReward`) — **implemented**
3. Items (`Item`, `Category="QuestItem"` discriminates `QuestItemData`) — **implemented**
4. Karma impacts (`KarmaImpact` / `KarmaDelta`) — **implemented**
5. NPCs (`NpcData` — full authoring; `Quests[]` and `LootTable` round-trip-only in v1) — **implemented**
6. Factions (`FactionData`) — **implemented**

Plus **Game concept** — a single Bleepforge-only doc (`data/concept.json`) used as the app homepage, *not* exported to Godot. Holds title, tagline, description, logo/icon/splash images, genre, setting, status, inspirations, notes. Covered in the "Architecture decisions" section below.

**Graph view interactions:**

- **Drag nodes** to reposition — saved per-folder to `data/dialogs/<folder>/_layout.json` on drag-stop.
- **Per-line outgoing handles**: every `DialogLine` has its own source handle (small emerald square on the right edge, vertically aligned to its row). Drag from the line you want the choice attached to. Edges encode `sourceHandle: "line-<idx>"`; `onConnect` uses it to pick the right line.
- **Drag-to-empty-space**: dropping a connection on empty canvas prompts (modal) for a new sequence id, creates the sequence with one empty line in the current folder, wires the source's choice to it, and saves the layout position at the drop point.
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

- **`NpcQuestEntry` and `LootTable` editors** in the NPC form. Both arrays are **round-trip preserved** but not authored in v1 — Bleepforge surfaces them as read-only summaries. Phase 3 of the NPC refactor will add editors for them.
- **`LootEntry.PickupScene` authoring** — `.tscn` (PackedScene) refs are kept as opaque `res://` strings. Loot identity isn't keyed on Item slugs, so it can't piggyback on the existing item picker. If we ever want to author loot, it's its own design problem.
- **`BalloonLine` authoring** — `CasualRemark` is an opaque `res://` path to a separate `BalloonLine` `.tres`. Not surfaced for editing.
- **Auto-import (Godot → Bleepforge)**: now wired (live-sync via `WATCH_TRES`); see the "Live-sync from Godot" section below. Any `.tres` save in Godot reimports the matching JSON and pushes a `Bleepforge:sync` event over SSE to all open browser tabs.

**Headline next feature: graph view of dialogs.** Each `DialogSequence` is a node, each `DialogChoice.NextSequenceId` is an edge. Pan/zoom, click-for-detail, dagre auto-layout. Likely [React Flow](https://reactflow.dev) (`@xyflow/react`). Scoped per-folder once multi-folder dialog support lands.

**Other near-term:**

- (none queued — graph polish landed)

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
- **Integrity check.** The check itself lives in [client/src/integrity/issues.ts](client/src/integrity/issues.ts) (`computeIssues(catalog)`) so both [/integrity](client/src/integrity/IntegrityPage.tsx) (the page) and the App nav (the indicator) consume the same logic. Catches dangling `QuestGiverId`, missing `TargetItem` / `Reward.Item` slugs, missing `QuestItemData.QuestId`, dangling `NextSequenceId`, duplicate sequence ids across folders, duplicate objective ids within a quest. Issues link to the offending entity's edit form. Never blocks save. The Integrity nav link reflects state live: emerald `✓` when clean, red tint with `(N)` count when dirty, neutral while the catalog is loading.
- **Reusable modal.** [Modal.tsx](client/src/Modal.tsx) provides `showConfirm(opts)` and `showPrompt(opts)` imperative APIs that return Promises (no `useState` boilerplate at call sites). `ModalHost` is mounted once at the App root and reads from a module-level singleton + pub/sub bus. Used everywhere a confirm or prompt is needed (delete confirmations, graph reset-layout, drag-to-empty new-sequence prompt with validation, etc.). All native `window.confirm` / `window.prompt` calls have been removed. Pixel-themed styling matches the rest of the UI.
- **Back navigation.** Every Edit page (`/items/:slug`, `/quests/:id`, `/npcs/:npcId`, `/karma/:id`, `/dialogs/:folder/:id`) renders a `← Back to <list>` link at the top. The Dialog Edit's back link preserves the folder query param so you return to the correct graph.
- **Preferences page.** [/preferences](client/src/preferences/PreferencesPage.tsx), reached via the pixel gear icon in the header (replaced the always-visible theme swatch row). Three sections: Theme, Typography, Import from Godot. Theme + typography are user-local (localStorage); the import section is the same flow that used to live at `/import` (the old route still redirects here for back-compat). Import field's last-used Godot project root is also persisted in localStorage so it survives reloads.
- **Theming.** Every theme is a CSS-only override on `[data-theme="X"]` of `<html>`, defined in [client/src/index.css](client/src/index.css). Each block re-points the accent (`--color-emerald-*`) to a different Tailwind palette and re-tints the neutral scale toward the same hue with low chroma. Canvas tones (`--canvas-bg`, `--canvas-pattern`) are set per theme — invariant: canvas is always slightly darker than the page bg so the React Flow stage reads as recessed. Themes: dark, light, red, amber, green, cyan, blue, magenta. [client/src/Theme.tsx](client/src/Theme.tsx) holds the registry + `useTheme` hook + early-applies the saved theme to avoid flash. [client/src/themeColors.ts](client/src/themeColors.ts) exposes `useThemeColors()` to JS that needs the live computed values (SVG strokes, marker fills inside React Flow that can't be Tailwind classes).
- **Typography knobs.** [client/src/Font.tsx](client/src/Font.tsx) holds three independently-persisted user settings: body font (8 pixel families, native `<select>` with each option styled in its own family), UI scale (`--text-scale` on `:root`, drives `html { font-size }` so `rem`-based padding scales with text — true UI zoom, not text-only resize), letter spacing (`--body-letter-spacing` on `<body>`, mono keeps its hard 0 override). Display font (Press Start 2P) and mono (VT323) stay fixed to preserve identity. The 5 added body fonts beyond Pixelify Sans / Press Start 2P / VT323: Silkscreen, Jersey 10, Tiny5, DotGothic16, Handjet, Workbench, Sixtyfour — all on Google Fonts so no additional infra.
- **Themed scrollbars.** Track + thumb resolve through `--color-neutral-*` so they re-tint per theme (light themes get a darker thumb on a lighter bg, dark themes the inverse — both directions land naturally). Hover/active uses the accent so grabbing the bar gives a theme-colored "lit up" cue. Webkit pseudos for the hover state, `scrollbar-color` for Firefox.
- **Game concept page** ([client/src/concept/Page.tsx](client/src/concept/Page.tsx)) is the app homepage at `/concept` — `/` redirects there. Single Bleepforge-only document at [data/concept.json](data/concept.json), served via a singleton router at `/api/concept` (GET + PUT, no list, no domain CRUD machinery). Schema in [shared/src/concept.ts](shared/src/concept.ts). All fields optional — the page renders the splash image / title / tagline / genre etc. as a hero only when content is present, then drops to the editable form below. Not exported to Godot, no `.tres` round-trip.
- **Splash screen** ([client/src/SplashScreen.tsx](client/src/SplashScreen.tsx)) fires on every fresh mount of the app (i.e. real refresh / first load). Bleepforge logo + 3s pixel-themed loading bar. The current URL is preserved across the splash because the router doesn't re-mount — F5 on `/quests` goes splash → `/quests`. Clicking the `BLEEPFORGE` header label does `window.location.href = "/"`, which both reloads AND lands on `/concept`, so logo-click semantics are "refresh to home" rather than "navigate to home". Eventually replaced by Tauri's native splash for the desktop build; the React version stays as a fallback for web/dev sessions.
- **List-page card pattern.** Items and Quests share the same shape: header row with count + New button, filter row (text search + domain-specific dropdowns + sort), grid of cards (`grid-cols-1 sm:2 lg:3 xl:4`) grouped by a primary axis. Items group by Category, Quests by quest giver. Cards live in their own component ([item/ItemCard.tsx](client/src/item/ItemCard.tsx), [quest/QuestCard.tsx](client/src/quest/QuestCard.tsx)) and surface the most useful info at a glance: portrait/icon, title, id, line-clamped description, and color-coded Badge components per type/category. Quest cards additionally show objective-type breakdown (`2× kill`, `1× collect`) and reward summary (`150c`, `⌹ 3`, `⚑ 2`), plus an auto-managed-flag strip at the bottom (`ActiveFlag` / `CompleteFlag` / `TurnedInFlag`) only when set.
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

Bleepforge's storage is per-folder under `dialoguer/data/dialogs/`. Multi-folder support to mirror this Godot organization is a near-term task.

```text
DialogSequence
  Id          : string         // globally unique; registry key
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

**Bleepforge storage**: `data/factions/<Faction>.json` (one file per enum value: `Scavengers.json`, `FreeRobots.json`, `RFF.json`, `Grove.json`). The `.tres` write-back mapper reconciles `DisplayName` and `ShortDescription` round-trip; `Icon`/`Banner` ext-resource refs are not reconciled (parity with `Item.Icon` — deferred). The locator (`findFactionTres`) walks subfolders and matches `script_class="FactionData"` plus the `Faction = N` int.

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
  Quests                 : NpcQuestEntry[] // round-trip only in v1

  // Karma
  DeathImpactId          : string         // KarmaImpact.Id
  DeathImpactIdContextual: string         // KarmaImpact.Id when ContextualFlag is set
  ContextualFlag         : string

  // Misc
  LootTable              : LootTable      // inline sub-resource, round-trip only in v1
  CasualRemark           : BalloonLine    // → string res:// path (opaque)
  DidSpeakFlag           : string

NpcQuestEntry (sub-resource, round-trip preserved)
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

**v1 write-back is scalar-only.** Mirrors Item's pattern: the writer reconciles 7 string fields (`DisplayName`, `MemoryEntryId`, `OffendedFlag`, `DeathImpactId`, `DeathImpactIdContextual`, `ContextualFlag`, `DidSpeakFlag`). Reference fields (`Portrait`, `DefaultDialog`, `OffendedDialog`, `CasualRemark`) and array fields (`Quests`, `LootTable`) are left untouched in the `.tres` — round-trip preserved but not authored. The locator (`findNpcTres`) walks `characters/npcs/<model>/data/` and matches `script_class="NpcData"` plus `NpcId = "<id>"`.

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
  - Texture paths (Portrait) — UID read from `<png>.import` sidecar.
  - Project scripts (DialogChoice.cs, QuestObjective.cs, QuestReward.cs) — UID found by scanning the project for any other `.tres` that already references the script.

**Reorder-safe via `_subId`:** every sub-resource-backed JSON entry (DialogLine, DialogChoice, KarmaDelta, QuestObjective, QuestReward) carries an optional `_subId` mirroring the Godot sub_resource id. The importer populates it; mappers use it for stable-identity matching across reorder, add, update, and remove. Existing JSON was migrated via `pnpm --filter @bleepforge/server migrate-subids` (idempotent). New entries authored in Bleepforge UI have no `_subId` until first save, when one is minted.

**Save-to-Godot wiring (gated by `WRITE_TRES`):** the four save endpoints — `PUT /api/items/:slug`, `/api/karma/:id`, `/api/quests/:id`, `/api/dialogs/:folder/:id` — first write the JSON (always), then optionally call the matching mapper to update the live `.tres` in `GODOT_PROJECT_ROOT`. Atomic write (temp file + rename). Default off; set `WRITE_TRES=1` in `.env` and restart the server to enable. The save response shape is `{ entity, tresWrite }` where `tresWrite` is `{ attempted, ok, path, warnings, error }` — clients can ignore it for now (api.ts logs to console). Server logs every attempt.

**Live-sync from Godot (gated by `WATCH_TRES`):** when set to `1`, the server watches `GODOT_PROJECT_ROOT` via [chokidar](https://github.com/paulmillr/chokidar) (filtered to `.tres` and excluding the `.godot/` cache). On external change: re-imports that one file via the import mappers, overwrites the matching JSON in `data/`, and publishes a `SyncEvent` (`{ domain, key, action }`) on an in-memory bus. The SSE endpoint `GET /api/sync/events` streams those events to any open browser tab. The client opens an `EventSource` once at app boot ([client/src/sync/stream.ts](client/src/sync/stream.ts)), re-dispatches each event as a `Bleepforge:sync` window CustomEvent, and components register via `useSyncRefresh({ domain, key, onChange })` to refetch when their entity changes.

We use a 150 ms per-path debounce we control rather than chokidar's `awaitWriteFinish` — the latter has a stuck-state bug for atomic-rename saves where the new file ends up with the same byte size as the old one (the polling state machine waits forever for a stabilization that never comes). Symptom was reliable: a specific dialog would stop firing watcher events after a save or two and stay silent until the server restarted.

Self-write suppression in [server/src/tres/writer.ts](server/src/tres/writer.ts): every save records the path with a timestamp; the watcher skips events for paths within a 1.5 s window. Without this, a Bleepforge save would trigger our own watcher → re-import → emit event → client refetch (harmless but wasteful).

UI subscribers: every list/edit page wires `useSyncRefresh` for its domain (item, karma, quest, dialog), the dialog graph view subscribes for the active folder, `ItemIcon` re-fetches its descriptor on item events (so a Godot-side icon change shows up live), and `useCatalog` (autocomplete) bridges through the catalog-bus so it also refreshes on any sync event. NPCs are intentionally not subscribed — there's no `.tres` watcher fire for that domain.

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
- **`NpcQuestEntry` file model (blocking domain 5)**: are these standalone `.tres` files in a folder (so we can replicate the same CRUD pattern), or are they an inline array on an NPC resource (so they only become editable once we author NPCs too)?
- **Dialog folder path**: editor currently uses `shared/dialogs` as a guess. The Godot side reads from `DialogFolders.AllFolders` (file not yet shared). When you have a sec, share that file so the editor matches reality. Multiple folders aren't supported yet but are a small extension to the CRUD helper.
- `KarmaTier` enum has 7 values but `GetTierForValue` only returns 5 (Liked/Idolized unreachable). Authored content doesn't care, but worth confirming this is a known WIP and not a bug we're modeling around.
- **`Faction` enum vs faction folder mismatch**: enum has 4 (Scavengers, FreeRobots, RFF, Grove); `shared/components/factions/` has 5 folders (the 4 above + `robotek/` with a `robotek.tres`). Either the enum is missing Robotek or robotek is unfinished. Editor's faction picker is currently the enum's 4.

**Editor scope / next steps:**

- **Graph view of dialogs** — the headline feature; this is the reason Bleepforge exists.
- **Multi-folder dialog support** — folders = speaker contexts (Eddie, Krang, etc.), mirroring `DialogFolders.cs` organization in Godot. Small extension to the CRUD helper.
- **Lightweight integrity check** — within Bleepforge's own data: duplicate IDs, dangling `NextSequenceId` / `QuestId` / item slug / `QuestGiverId` references. Visible nag, never blocks save.
- v1 polish on existing UIs (deferred — Yonatan: "we'll polish with time").

## Collaboration

Per Yonatan's global CLAUDE.md: docs are built together, I'm expected to have opinions and push back. This file evolves as we learn — not a static spec.
