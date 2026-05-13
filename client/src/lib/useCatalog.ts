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
  shadersApi,
  type BalloonFolderGroup,
  type DialogFolderGroup,
  type ShaderAsset,
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
  /** Per-category Codex groups. Each carries its meta (schema) plus
   *  current entries. Empty when no categories have been created yet. */
  codexCategories: CodexCategoryGroup[];
  /** Flat per-entry list, useful for app search and integrity checks. */
  codexEntries: { category: string; meta: CodexCategoryMeta; entry: CodexEntry }[];
  /** Every discovered .gdshader file in the Godot project. Loaded once at
   *  catalog boot so the global Ctrl+K search can jump to a shader by
   *  basename. The shader gallery has its own (more detailed) fetch with
   *  usage counts; this list carries just the descriptors. */
  shaders: ShaderAsset[];
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
      // Shaders are a Godot-project file scan rather than a JSON CRUD list;
      // catch failures so a missing endpoint (or a project root without
      // shaders) doesn't take the whole catalog down.
      shadersApi.list().catch(() => ({ shaders: [] as ShaderAsset[] })),
    ])
      .then(([npcs, items, quests, karma, factions, pickups, dialogs, balloons, codexCategories, shadersResponse]) => {
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
          shaders: shadersResponse.shaders,
          flags,
        });
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
        // The UI's own error-handling kicks in once the user navigates
        // (each list page surfaces its own fetch error).
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return catalog;
}
