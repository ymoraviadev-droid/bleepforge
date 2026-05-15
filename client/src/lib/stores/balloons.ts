import type { Balloon } from "@bleepforge/shared";
import { balloonsApi, type BalloonFolderGroup } from "../api";
import { createFolderedStore, useFolderedStore } from "./createFolderedStore";

export const balloonStore = createFolderedStore<BalloonFolderGroup, Balloon>({
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
