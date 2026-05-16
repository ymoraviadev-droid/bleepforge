// Choreographs the three update paths that flow into the domain
// stores:
//
//   1) catalog-bus (`refreshCatalog()`) — manual all-refresh trigger.
//      Today only the Integrity diagnostics tab's "Refresh" button
//      fires this. Refreshes every store that's been touched at least
//      once. The status gate is the safety: untouched stores stay
//      idle, no force-load.
//
//   2) `Bleepforge:sync` SSE — external .tres change for one of the
//      seven game-mirrored domains. The event's `domain` field picks
//      the matching store; the rest stay untouched. For "deleted"
//      events we don't bother removing the key locally — the next
//      store.refresh() reflects the missing entity. Flat domains are
//      direct mappings; the foldered domains (dialog, balloon) split
//      `event.key` on "/" to get folder+id when targeted invalidation
//      becomes worth the extra surface — Phase 3 just refreshes the
//      slice wholesale (one fetch, one domain).
//
//   3) `Bleepforge:shader` SSE — external .gdshader change. Routes to
//      the shader store only.
//
// Phase 3 (v0.2.5) replaces the prior blanket "every event refreshes
// every store" behavior with per-domain routing. Local save/remove
// calls in api.ts now patch their respective stores directly from
// PUT/DELETE responses, so the SSE events here are the external-only
// path (plus the saving window's own self-echo, which lands on a
// store that's already in sync via the patch — small redundant
// fetch, no correctness issue).

import { subscribeCatalog } from "../catalog-bus";
import type { SyncDomain } from "../sync/stream";
import { balloonStore } from "./balloons";
import { codexStore } from "./codex";
import type { Store } from "./createStore";
import type { FolderedStore } from "./createFolderedStore";
import { dialogStore } from "./dialogs";
import { factionStore } from "./factions";
import { itemStore } from "./items";
import { karmaStore } from "./karma";
import { npcStore } from "./npcs";
import { pickupStore } from "./pickups";
import { questStore } from "./quests";
import { shaderStore } from "./shaders";

type AnyStore =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | Store<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | FolderedStore<any, any>;

const allStores: AnyStore[] = [
  itemStore,
  npcStore,
  questStore,
  karmaStore,
  factionStore,
  pickupStore,
  shaderStore,
  dialogStore,
  balloonStore,
  codexStore,
];

// SyncDomain → store. Covers every domain the sync SSE stream
// publishes; pickups + codex + shaders are not part of SyncDomain so
// they're not in this map. Manifest-discovered domain events (v0.2.8
// Phase 4+) miss the lookup and no-op here — those domains don't have
// dedicated singleton stores; consumers re-fetch via the manifest list
// page on event arrival.
const storeForSyncDomain = {
  item: itemStore,
  npc: npcStore,
  quest: questStore,
  karma: karmaStore,
  faction: factionStore,
  dialog: dialogStore,
  balloon: balloonStore,
} satisfies Partial<Record<SyncDomain, AnyStore>>;

function maybeRefresh(store: AnyStore): void {
  if (store.getSnapshot().status !== "idle") void store.refresh();
}

let wired = false;

export function wireStoresToBus(): void {
  if (wired) return;
  wired = true;

  // (1) Manual all-refresh path.
  subscribeCatalog(() => {
    for (const s of allStores) maybeRefresh(s);
  });

  // (2) Per-domain SSE routing.
  window.addEventListener("Bleepforge:sync", (e) => {
    const map = storeForSyncDomain as Record<string, AnyStore | undefined>;
    const store = map[e.detail.domain];
    if (store) maybeRefresh(store);
  });

  // (3) Shader SSE — single domain.
  window.addEventListener("Bleepforge:shader", () => {
    maybeRefresh(shaderStore);
  });
}
