import type { KarmaImpact } from "@bleepforge/shared";
import { karmaApi } from "../api";
import { createStore, useStore, type Store } from "./createStore";

export const karmaStore: Store<KarmaImpact> = createStore<KarmaImpact>({
  name: "karma",
  fetcher: () => karmaApi.list(),
  keyOf: (k) => k.Id,
});

export const useKarma = (): ReturnType<typeof useStore<KarmaImpact>> =>
  useStore(karmaStore);
