// useCatalog aggregates every domain slice + derived selector into one
// `Catalog | null` bag for back-compat with existing call sites
// (CatalogDatalists, AppSearch, Workbench, useDiagnostics, IntegrityTab,
// NpcEdit, CodexEdit). The bag is `null` until every slice + selector
// reports `ready` — same blocking semantics as the pre-v0.2.5 version.
//
// The win over the prior version: the underlying data lives in module-
// level singletons, so seven `useCatalog()` mounts share one fetch per
// domain instead of each running its own `Promise.all` of ten fetches.
// New code can also import per-domain hooks directly from `./stores` to
// skip the bag entirely and get fine-grained loading states.

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
import type { BalloonFolderGroup, DialogFolderGroup, ShaderAsset } from "./api";
import {
  useBalloonRefs,
  useBalloons,
  useCodex,
  useCodexEntries,
  useDialogs,
  useFactions,
  useFlags,
  useItems,
  useKarma,
  useNpcs,
  usePickups,
  useQuests,
  useSequences,
  useShaders,
  type BalloonRef,
} from "./stores";

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
  balloons: BalloonFolderGroup[];
  balloonRefs: BalloonRef[];
  codexCategories: CodexCategoryGroup[];
  codexEntries: { category: string; meta: CodexCategoryMeta; entry: CodexEntry }[];
  shaders: ShaderAsset[];
  flags: string[];
}

export function useCatalog(): Catalog | null {
  // Source slices.
  const npcs = useNpcs();
  const items = useItems();
  const quests = useQuests();
  const karma = useKarma();
  const factions = useFactions();
  const pickups = usePickups();
  const dialogs = useDialogs();
  const balloons = useBalloons();
  const codex = useCodex();
  const shaders = useShaders();

  // Derived projections (subscribe to their own source slices internally).
  const sequences = useSequences();
  const balloonRefs = useBalloonRefs();
  const codexEntries = useCodexEntries();
  const flags = useFlags();

  // Block on all-ready. A single slice's error null-collapses the catalog
  // (same shape as the prior version's `.catch(() => setCatalog(null))`),
  // because consumers branch on `catalog === null` and don't have per-slice
  // error handling. New code should import the per-domain hooks directly
  // to get the granular status.
  if (
    !npcs.data ||
    !items.data ||
    !quests.data ||
    !karma.data ||
    !factions.data ||
    !pickups.data ||
    !dialogs.data ||
    !balloons.data ||
    !codex.data ||
    !shaders.data ||
    !sequences.data ||
    !balloonRefs.data ||
    !codexEntries.data ||
    !flags.data
  ) {
    return null;
  }

  return {
    npcs: npcs.data,
    items: items.data,
    quests: quests.data,
    karma: karma.data,
    factions: factions.data,
    pickups: pickups.data,
    dialogs: dialogs.data,
    sequences: sequences.data,
    balloons: balloons.data,
    balloonRefs: balloonRefs.data,
    codexCategories: codex.data,
    codexEntries: codexEntries.data,
    shaders: shaders.data,
    flags: flags.data,
  };
}
