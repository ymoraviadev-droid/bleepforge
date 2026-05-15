import type { Item } from "@bleepforge/shared";
import { itemsApi } from "../api";
import { createStore, useStore, type Store } from "./createStore";

// Explicit type annotation breaks the inference cycle between
// `itemStore` and `itemsApi`'s save/remove paths (which read this
// store back via the `getStore` callback).
export const itemStore: Store<Item> = createStore<Item>({
  name: "items",
  fetcher: () => itemsApi.list(),
  keyOf: (i) => i.Slug,
});

export const useItems = (): ReturnType<typeof useStore<Item>> =>
  useStore(itemStore);
