import type { Npc } from "@bleepforge/shared";
import { npcsApi } from "../api";
import { createStore, useStore, type Store } from "./createStore";

export const npcStore: Store<Npc> = createStore<Npc>({
  name: "npcs",
  fetcher: () => npcsApi.list(),
  keyOf: (n) => n.NpcId,
});

export const useNpcs = (): ReturnType<typeof useStore<Npc>> =>
  useStore(npcStore);
