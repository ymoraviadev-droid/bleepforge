// Wires every store to the legacy `catalog-bus` so the existing
// `refreshCatalog()` calls in api.ts (fired after every save/remove in
// Phase 1) trigger a refetch of each domain. Same blanket behavior as
// pre-v0.2.5; Phase 3 will replace this with per-domain invalidation
// driven by the SSE event's `domain` field.
//
// Gate: each store only refreshes if it's been touched at least once
// (status !== "idle"). Without this gate, refreshCatalog would force-
// load every slice on the first save in the app even if nobody had
// asked for that data yet.

import { subscribeCatalog } from "../catalog-bus";
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

const stores: AnyStore[] = [
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

let wired = false;

export function wireStoresToBus(): void {
  if (wired) return;
  wired = true;
  subscribeCatalog(() => {
    for (const s of stores) {
      const snap = s.getSnapshot();
      if (snap.status !== "idle") void s.refresh();
    }
  });
}
