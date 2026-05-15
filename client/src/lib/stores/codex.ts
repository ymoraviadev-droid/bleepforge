import type { CodexCategoryGroup, CodexEntry } from "@bleepforge/shared";
import { codexApi } from "../api";
import {
  createFolderedStore,
  useFolderedStore,
  type FolderedStore,
} from "./createFolderedStore";

// Codex groups carry both `meta` (the per-category schema) and
// `entries`. The store treats entries as the patchable unit; meta
// changes (rename a property, add a new field) trigger a full
// refetch via `refresh()`, since meta is rare-write and one-document
// per category. The same is true of category add/delete: those go
// through `refresh()` rather than `patch`/`remove`.
//
// `buildGroup` for a folder we've never seen is intentionally
// conservative — it'd only fire if a save came in for a category
// the store hadn't loaded yet, which shouldn't happen (the user
// can't author into a non-existent category). The fallback shape
// uses an empty meta with a placeholder DisplayName + Color so the
// store doesn't crash; the next refresh will overwrite with the
// real meta from disk.
export const codexStore: FolderedStore<CodexCategoryGroup, CodexEntry> = createFolderedStore<CodexCategoryGroup, CodexEntry>({
  name: "codex",
  fetcher: () => codexApi.listAll(),
  folderOf: (g) => g.category,
  entitiesOf: (g) => g.entries,
  keyOf: (e) => e.Id,
  withEntities: (g, entries) => ({ ...g, entries }),
  buildGroup: (category, entries) => ({
    category,
    meta: {
      Category: category,
      DisplayName: category,
      Color: "emerald",
      Properties: [],
      CreatedAt: new Date().toISOString(),
    },
    entries,
  }),
});

export const useCodex = (): ReturnType<
  typeof useFolderedStore<CodexCategoryGroup, CodexEntry>
> => useFolderedStore(codexStore);
