import type { Balloon } from "@bleepforge/shared";
import { balloonsApi, type BalloonFolderGroup } from "../api";
import {
  createFolderedStore,
  useFolderedStore,
  type FolderedStore,
} from "./createFolderedStore";

export const balloonStore: FolderedStore<BalloonFolderGroup, Balloon> = createFolderedStore<BalloonFolderGroup, Balloon>({
  name: "balloons",
  fetcher: () => balloonsApi.listAll(),
  folderOf: (g) => g.folder,
  entitiesOf: (g) => g.balloons,
  keyOf: (b) => b.Id,
  withEntities: (g, balloons) => ({ ...g, balloons }),
  buildGroup: (folder, balloons) => ({ folder, balloons }),
});

export const useBalloons = (): ReturnType<
  typeof useFolderedStore<BalloonFolderGroup, Balloon>
> => useFolderedStore(balloonStore);
