// Derived projections over slices. These are NOT stores — they have no
// fetcher, no SSE invalidation, no write path. They subscribe to their
// source slices and compute on demand. From the consumer's POV they
// look like a hook with `{ data, status, error }`; internally they're
// memoized selectors driven by `useSyncExternalStore`.

import { useMemo } from "react";
import type { Balloon, CodexCategoryMeta, CodexEntry, DialogSequence, Quest } from "@bleepforge/shared";
import { useBalloons } from "./balloons";
import { useCodex } from "./codex";
import type { StoreStatus } from "./createStore";
import { useDialogs } from "./dialogs";
import { useQuests } from "./quests";

export interface DerivedState<T> {
  data: T | null;
  status: StoreStatus;
  error: string | null;
}

export interface BalloonRef {
  id: string;
  folder: string;
  balloon: Balloon;
}

export interface CodexEntryRow {
  category: string;
  meta: CodexCategoryMeta;
  entry: CodexEntry;
}

/** Flat list of every DialogSequence across all folders. Drives the
 *  app-search index and flag collection. */
export function useSequences(): DerivedState<DialogSequence[]> {
  const dialogs = useDialogs();
  const data = useMemo(() => {
    if (!dialogs.data) return null;
    return dialogs.data.flatMap((g) => g.sequences);
  }, [dialogs.data]);
  return { data, status: dialogs.status, error: dialogs.error };
}

/** Flat list of balloons with their Bleepforge "<folder>/<basename>" id
 *  and folder context. Drives the NPC CasualRemarks autocomplete and the
 *  app-search index. */
export function useBalloonRefs(): DerivedState<BalloonRef[]> {
  const balloons = useBalloons();
  const data = useMemo(() => {
    if (!balloons.data) return null;
    return balloons.data.flatMap((g) =>
      g.balloons.map((b) => ({
        id: `${g.folder}/${b.Id}`,
        folder: g.folder,
        balloon: b,
      })),
    );
  }, [balloons.data]);
  return { data, status: balloons.status, error: balloons.error };
}

/** Flat list of every codex entry with its category context. Drives
 *  integrity checks and the app-search index. */
export function useCodexEntries(): DerivedState<CodexEntryRow[]> {
  const codex = useCodex();
  const data = useMemo(() => {
    if (!codex.data) return null;
    return codex.data.flatMap((g) =>
      g.entries.map((entry) => ({
        category: g.category,
        meta: g.meta,
        entry,
      })),
    );
  }, [codex.data]);
  return { data, status: codex.status, error: codex.error };
}

function collectFlags(
  sequences: DialogSequence[],
  quests: Quest[],
): string[] {
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

/** Every flag name seen in the corpus — gathered from DialogSequence
 *  SetsFlag, DialogChoice SetsFlag, Quest auto-managed flags, and
 *  QuestReward Flag rewards. Drives the flag autocomplete datalist. */
export function useFlags(): DerivedState<string[]> {
  const sequences = useSequences();
  const quests = useQuests();
  const worst: StoreStatus =
    sequences.status === "error" || quests.status === "error"
      ? "error"
      : sequences.status === "loading" || quests.status === "loading"
        ? "loading"
        : sequences.status === "ready" && quests.status === "ready"
          ? "ready"
          : "idle";
  const error = sequences.error ?? quests.error;
  const data = useMemo(() => {
    if (!sequences.data || !quests.data) return null;
    return collectFlags(sequences.data, quests.data);
  }, [sequences.data, quests.data]);
  return { data, status: worst, error };
}
