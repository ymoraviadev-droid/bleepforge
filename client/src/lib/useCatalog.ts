import { useEffect, useState } from "react";
import type {
  Balloon,
  CodexCategoryGroup,
  CodexCategoryMeta,
  CodexEntry,
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
  codexApi,
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
import { markBootCheckpoint } from "./boot/progress";
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
  /** Per-category Codex groups. Each carries its meta (schema) plus
   *  current entries. Empty when no categories have been created yet. */
  codexCategories: CodexCategoryGroup[];
  /** Flat per-entry list, useful for app search and integrity checks. */
  codexEntries: { category: string; meta: CodexCategoryMeta; entry: CodexEntry }[];
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
      codexApi.listAll(),
    ])
      .then(([npcs, items, quests, karma, factions, pickups, dialogs, balloons, codexCategories]) => {
        if (cancelled) return;
        const sequences = dialogs.flatMap((g) => g.sequences);
        const balloonRefs = balloons.flatMap((g) =>
          g.balloons.map((b) => ({
            id: `${g.folder}/${b.Id}`,
            folder: g.folder,
            balloon: b,
          })),
        );
        const codexEntries = codexCategories.flatMap((g) =>
          g.entries.map((entry) => ({
            category: g.category,
            meta: g.meta,
            entry,
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
          codexCategories,
          codexEntries,
          flags,
        });
        // Splash checkpoint #3: catalog loaded. Idempotent — subsequent
        // catalog refreshes (after Godot edits via the watcher) re-enter
        // this branch but markBootCheckpoint is a no-op once set.
        markBootCheckpoint("catalog");
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
        // Even on failure, advance the splash so the user isn't stuck —
        // the timeout would catch this anyway, but advancing immediately
        // is kinder. The UI's own error-handling kicks in once they
        // navigate (each list page surfaces its own fetch error).
        markBootCheckpoint("catalog");
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return catalog;
}
