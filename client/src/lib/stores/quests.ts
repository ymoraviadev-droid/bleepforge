import type { Quest } from "@bleepforge/shared";
import { questsApi } from "../api";
import { createStore, useStore, type Store } from "./createStore";

export const questStore: Store<Quest> = createStore<Quest>({
  name: "quests",
  fetcher: () => questsApi.list(),
  keyOf: (q) => q.Id,
});

export const useQuests = (): ReturnType<typeof useStore<Quest>> =>
  useStore(questStore);
