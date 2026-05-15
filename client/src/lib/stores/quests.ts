import type { Quest } from "@bleepforge/shared";
import { questsApi } from "../api";
import { createStore, useStore } from "./createStore";

export const questStore = createStore<Quest>({
  name: "quests",
  fetcher: () => questsApi.list(),
  keyOf: (q) => q.Id,
});

export const useQuests = (): ReturnType<typeof useStore<Quest>> =>
  useStore(questStore);
