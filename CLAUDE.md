# Bleepforge

**A graph-based project organizer / planning tool** for Yonatan's Godot game **Flock of Bleeps** (formerly placeholder "AstroMan" — the C# namespace and project folder still use the old name). Visualizes and documents **dialogues** (the headline feature: a graph view), plus **quests**, **items**, **karma impacts**, and **NPCs**.

**Two-way editor with `.tres` as canonical.** The Godot `.tres` files are what the game runtime loads, so they stay canonical: anything that ships is what's in `astro-man/`. Bleepforge's JSON in `dialoguer/data/` is a working copy. When `WRITE_TRES=1` is set, every save in Bleepforge also pushes the edit into the matching `.tres` (atomic write). The read direction (`.tres` → JSON) is **not** auto-sync — it still runs through the Import page on demand, which doubles as the recovery path if Bleepforge's JSON drifts from Godot.

**Godot project on disk**: `/home/ymoravia/Data/Projects/Godot/astro-man/`. Bleepforge writes here only on save when `WRITE_TRES=1`, and only to `.tres` files we've already mapped. Defense in depth: the writer refuses any target outside `GODOT_PROJECT_ROOT`. The schema sections below mirror the Godot Resource fields 1:1 so the mappers can apply JSON edits to the corresponding `.tres` properties.

## Stack

- **Frontend**: React + TypeScript + Tailwind + Vite
- **Backend**: Express + TypeScript
- **Persistence**: JSON files at `dialoguer/data/{dialogs,quests,items,karma,npcs}/`, one file per entity

## v1 plan (decided)

**Scope** — five data domains:

1. Dialogs (`DialogSequence` / `DialogLine` / `DialogChoice`) — **CRUD + interactive graph view + multi-folder implemented**
2. Quests (`Quest` / `QuestObjective` / `QuestReward`) — **implemented**
3. Items (`Item`, `Category="QuestItem"` discriminates `QuestItemData`) — **implemented**
4. Karma impacts (`KarmaImpact` / `KarmaDelta`) — **implemented**
5. NPCs (lightweight doc: `NpcId`, `DisplayName`, `Description`) — **implemented**

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

- **Authoring full NPC behavior** (the 25-field `Npc : CharacterBody2D` from Godot, including `Quests : NpcQuestEntry[]`). NPC config lives as per-instance overrides in level scenes; Yonatan keeps editing in Godot's inspector. The NPC entity here is just a documentation stub for cross-reference (so `QuestGiverId` autocompletes, etc.).
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
- **Integrity check.** [/integrity](client/src/integrity/IntegrityPage.tsx) runs cross-domain validation client-side: dangling `QuestGiverId`, missing `TargetItem` / `Reward.Item` slugs, missing `QuestItemData.QuestId`, dangling `NextSequenceId`, duplicate sequence ids across folders, duplicate objective ids within a quest. Issues link to the offending entity's edit form. Never blocks save.
- **Reusable modal.** [Modal.tsx](client/src/Modal.tsx) provides `showConfirm(opts)` and `showPrompt(opts)` imperative APIs that return Promises (no `useState` boilerplate at call sites). `ModalHost` is mounted once at the App root and reads from a module-level singleton + pub/sub bus. Used everywhere a confirm or prompt is needed (delete confirmations, graph reset-layout, drag-to-empty new-sequence prompt with validation, etc.). All native `window.confirm` / `window.prompt` calls have been removed. Pixel-themed styling matches the rest of the UI.
- **Back navigation.** Every Edit page (`/items/:slug`, `/quests/:id`, `/npcs/:npcId`, `/karma/:id`, `/dialogs/:folder/:id`) renders a `← Back to <list>` link at the top. The Dialog Edit's back link preserves the folder query param so you return to the correct graph.
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

### Domain 5 — NPCs (lightweight documentation stub)

```text
Npc
  NpcId       : string    // matches NpcId set on the actual Npc instance in Godot
  DisplayName : string
  Description : string    // multiline notes — role, personality, where they appear
  Portraits   : string[]  // absolute paths to portrait images (aseprite source files, etc.)
  Sprites     : string[]  // absolute paths to sprite images
```

This is **not** a model of the full Godot `Npc : CharacterBody2D` (~25 exported fields across dialog, quest, karma, barter, loot, balloon, inventory). It's a doc stub: a list of "characters that exist," with attached art references for visual reference, so Bleepforge can autocomplete `QuestGiverId` and serve as a project bible.

**Image paths are independent of the Godot project** (Yonatan's request). They point at his aseprite source files directly, so edits to those files are reflected live in Bleepforge (no caching, see asset endpoint below).

**Why we don't author full NPCs:** NPC instance config lives as per-instance overrides in level scenes (`areas/prologue/prologue.tscn`), not on the NPC scene templates. Same scene template (`sld_500.tscn`) gets reused for multiple in-game characters (Krang and Korjack) — the "character" identity is at the level placement. Authoring this via JSON would require either parsing scene files (worse than `.tres` parsing) or a Godot-side refactor (extract per-instance data into a Resource). Neither is worth doing while Bleepforge is a documentation tool.

`NpcQuestEntry` (the dialog↔quest bridge with five dialog refs — `OfferDialog`, `AcceptedDialog`, `InProgressDialog`, `TurnInDialog`, `PostQuestDialog`) lives inside `Npc.Quests[]` — also out of scope. Yonatan edits it in Godot's inspector. Bleepforge's value here is documenting the dialog graph structure that NpcQuestEntry assembles, not the assembly itself.

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
