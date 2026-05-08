import { useEffect, useState } from "react";
import type {
  Balloon,
  DialogSequence,
  FactionData,
  Item,
  KarmaImpact,
  Npc,
  Pickup,
  Quest,
} from "@bleepforge/shared";
import {
  balloonsApi,
  dialogsApi,
  factionsApi,
  itemsApi,
  karmaApi,
  npcsApi,
  pickupsApi,
  questsApi,
  type BalloonFolderGroup,
  type DialogFolderGroup,
} from "./api";
import { catalogTick, subscribeCatalog } from "./catalog-bus";

export { refreshCatalog } from "./catalog-bus";

export interface Catalog {
  npcs: Npc[];
  items: Item[];
  quests: Quest[];
  karma: KarmaImpact[];
  factions: FactionData[];
  pickups: Pickup[];
  dialogs: DialogFolderGroup[];
  sequences: DialogSequence[];
  /** Per-folder balloon groups, mirroring the dialogs shape. Each balloon's
   *  full Bleepforge id is "<folder>/<Id>". */
  balloons: BalloonFolderGroup[];
  /** Flat list of balloons across all folders, with Bleepforge-id form for
   *  quick lookup by NpcData.CasualRemarks entries. */
  balloonRefs: { id: string; folder: string; balloon: Balloon }[];
  flags: string[];
}

function collectFlags(sequences: DialogSequence[], quests: Quest[]): string[] {
  const set = new Set<string>();
  const add = (s: string | undefined | null) => {
    if (s) set.add(s);
  };
  for (const seq of sequences) {
    add(seq.SetsFlag);
    for (const line of seq.Lines) {
      for (const c of line.Choices) add(c.SetsFlag);
    }
  }
  for (const q of quests) {
    add(q.ActiveFlag);
    add(q.CompleteFlag);
    add(q.TurnedInFlag);
    for (const r of q.Rewards) {
      if (r.Type === "Flag") add(r.FlagName);
    }
  }
  return [...set].sort();
}

export function useCatalog(): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tick, setTick] = useState(catalogTick);

  useEffect(() => subscribeCatalog(() => setTick(catalogTick())), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      npcsApi.list(),
      itemsApi.list(),
      questsApi.list(),
      karmaApi.list(),
      factionsApi.list(),
      pickupsApi.list(),
      dialogsApi.listAll(),
      balloonsApi.listAll(),
    ])
      .then(([npcs, items, quests, karma, factions, pickups, dialogs, balloons]) => {
        if (cancelled) return;
        const sequences = dialogs.flatMap((g) => g.sequences);
        const balloonRefs = balloons.flatMap((g) =>
          g.balloons.map((b) => ({
            id: `${g.folder}/${b.Id}`,
            folder: g.folder,
            balloon: b,
          })),
        );
        const flags = collectFlags(sequences, quests);
        setCatalog({
          npcs,
          items,
          quests,
          karma,
          factions,
          pickups,
          dialogs,
          sequences,
          balloons,
          balloonRefs,
          flags,
        });
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return catalog;
}
