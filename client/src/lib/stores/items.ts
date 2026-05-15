import type { Item } from "@bleepforge/shared";
import { itemsApi } from "../api";
import { createStore, useStore } from "./createStore";

export const itemStore = createStore<Item>({
  name: "items",
  fetcher: () => itemsApi.list(),
  keyOf: (i) => i.Slug,
});

export const useItems = (): ReturnType<typeof useStore<Item>> =>
  useStore(itemStore);
