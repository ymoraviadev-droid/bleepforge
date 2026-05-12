// Boot progress store — drives the splash screen's real progress bar.
//
// Three checkpoints are tracked, in the order they typically complete:
//   1. "server"      — /api/health responded 200 (server is up)
//   2. "preferences" — /api/preferences fetched + active theme applied
//                      (so the first paint after splash matches the user's
//                      saved theme, not the default-emerald)
//   3. "catalog"     — useCatalog's first batch loaded (so the first list
//                      page the user lands on isn't lazy-fetching)
//
// SSE streams + asset cache + boot reconcile (server-side, parallel) are
// intentionally NOT in the gate — they reconnect / fill on demand, and
// waiting for them would push the splash to 3+ seconds on every launch.
// A hard 10s timeout flips the store into a "timed out" state so the
// splash can surface a "Continue anyway?" affordance instead of spinning
// forever when something's wrong (e.g., server failed to boot).

import { useEffect, useState } from "react";

export type BootCheckpoint = "server" | "preferences" | "catalog";

const ORDER: readonly BootCheckpoint[] = ["server", "preferences", "catalog"];
const TIMEOUT_MS = 10_000;

const PHASE_LABEL: Record<BootCheckpoint, string> = {
  server: "Connecting to server…",
  preferences: "Loading preferences…",
  catalog: "Indexing catalog…",
};

interface BootState {
  completed: Set<BootCheckpoint>;
  timedOut: boolean;
}

const state: BootState = {
  completed: new Set(),
  timedOut: false,
};

const subs = new Set<() => void>();

function notify(): void {
  for (const fn of subs) fn();
}

let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
function ensureTimeoutArmed(): void {
  if (timeoutHandle !== null) return;
  timeoutHandle = setTimeout(() => {
    if (state.completed.size < ORDER.length) {
      state.timedOut = true;
      notify();
    }
  }, TIMEOUT_MS);
}

export function markBootCheckpoint(cp: BootCheckpoint): void {
  if (state.completed.has(cp)) return;
  state.completed.add(cp);
  // Once everything's done, no point arming the timeout if it hasn't
  // armed yet — but it usually has.
  if (state.completed.size === ORDER.length && timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  notify();
}

export interface BootProgress {
  /** Completed checkpoints in canonical order. */
  completed: BootCheckpoint[];
  /** Total number of checkpoints. */
  total: number;
  /** 0..100 — percent of checkpoints completed. */
  percent: number;
  /** Human label for the *next* uncompleted checkpoint, or null when done. */
  nextLabel: string | null;
  /** True once every checkpoint reported. */
  ready: boolean;
  /** True if the 10s timeout fired before everything completed. */
  timedOut: boolean;
}

export function useBootProgress(): BootProgress {
  const [, setTick] = useState(0);

  useEffect(() => {
    ensureTimeoutArmed();
    const fn = () => setTick((t) => t + 1);
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  }, []);

  const completedArr = ORDER.filter((cp) => state.completed.has(cp));
  const nextCp = ORDER.find((cp) => !state.completed.has(cp));
  return {
    completed: completedArr,
    total: ORDER.length,
    percent: Math.round((completedArr.length / ORDER.length) * 100),
    nextLabel: nextCp ? PHASE_LABEL[nextCp] : null,
    ready: completedArr.length === ORDER.length,
    timedOut: state.timedOut,
  };
}
