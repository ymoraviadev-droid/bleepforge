import type { FactionData } from "@bleepforge/shared";
import { factionsApi } from "../api";
import { createStore, useStore, type Store } from "./createStore";

export const factionStore: Store<FactionData> = createStore<FactionData>({
  name: "factions",
  fetcher: () => factionsApi.list(),
  keyOf: (f) => f.Faction,
});

export const useFactions = (): ReturnType<typeof useStore<FactionData>> =>
  useStore(factionStore);
