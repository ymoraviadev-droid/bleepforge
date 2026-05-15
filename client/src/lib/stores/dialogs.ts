import type { DialogSequence } from "@bleepforge/shared";
import { dialogsApi, type DialogFolderGroup } from "../api";
import {
  createFolderedStore,
  useFolderedStore,
  type FolderedStore,
} from "./createFolderedStore";

export const dialogStore: FolderedStore<DialogFolderGroup, DialogSequence> = createFolderedStore<DialogFolderGroup, DialogSequence>({
  name: "dialogs",
  fetcher: () => dialogsApi.listAll(),
  folderOf: (g) => g.folder,
  entitiesOf: (g) => g.sequences,
  keyOf: (s) => s.Id,
  withEntities: (g, sequences) => ({ ...g, sequences }),
  buildGroup: (folder, sequences) => ({ folder, sequences }),
});

export const useDialogs = (): ReturnType<
  typeof useFolderedStore<DialogFolderGroup, DialogSequence>
> => useFolderedStore(dialogStore);
