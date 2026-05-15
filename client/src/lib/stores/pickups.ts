import type { Pickup } from "@bleepforge/shared";
import { pickupsApi } from "../api";
import { createStore, useStore } from "./createStore";

// Pickups are a read-only catalog sourced from .tscn files on disk, not
// authored in Bleepforge. No SSE channel, no save/remove from the
// client — but the store shape still benefits from caching (the
// LootTable picker re-uses this list whenever an NPC form mounts).
export const pickupStore = createStore<Pickup>({
  name: "pickups",
  fetcher: () => pickupsApi.list(),
  // `name` is what the picker shows but can collide across folders
  // (different `.tscn` files with the same basename); `path` is the
  // unique identity. Patch/remove are no-ops in practice for pickups —
  // they're read-only — but the key still has to be stable.
  keyOf: (p) => p.path,
});

export const usePickups = (): ReturnType<typeof useStore<Pickup>> =>
  useStore(pickupStore);
