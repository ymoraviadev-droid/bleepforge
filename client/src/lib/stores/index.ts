// Public surface for the stores layer. Consumers import per-domain
// hooks here; the implementation files are stable API per-domain.

export { useStore, type Store, type StoreState, type StoreStatus } from "./createStore";
export { useFolderedStore, type FlatEntry, type FolderedStore, type FolderedStoreState } from "./createFolderedStore";

export { itemStore, useItems } from "./items";
export { npcStore, useNpcs } from "./npcs";
export { questStore, useQuests } from "./quests";
export { karmaStore, useKarma } from "./karma";
export { factionStore, useFactions } from "./factions";
export { pickupStore, usePickups } from "./pickups";
export { shaderStore, useShaders } from "./shaders";

export { dialogStore, useDialogs } from "./dialogs";
export { balloonStore, useBalloons } from "./balloons";
export { codexStore, useCodex } from "./codex";

export {
  useBalloonRefs,
  useCodexEntries,
  useFlags,
  useSequences,
  type BalloonRef,
  type CodexEntryRow,
  type DerivedState,
} from "./selectors";
