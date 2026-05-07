import { useEffect, useState } from "react";
import type {
  DialogSequence,
  FactionData,
  Item,
  KarmaImpact,
  Npc,
  Quest,
} from "@bleepforge/shared";
import {
  dialogsApi,
  factionsApi,
  itemsApi,
  karmaApi,
  npcsApi,
  questsApi,
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
  dialogs: DialogFolderGroup[];
  sequences: DialogSequence[];
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
      dialogsApi.listAll(),
    ])
      .then(([npcs, items, quests, karma, factions, dialogs]) => {
        if (cancelled) return;
        const sequences = dialogs.flatMap((g) => g.sequences);
        const flags = collectFlags(sequences, quests);
        setCatalog({
          npcs,
          items,
          quests,
          karma,
          factions,
          dialogs,
          sequences,
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
