// Boot progress store — drives the splash screen's real progress bar.
//
// Two checkpoints are tracked, in the order they typically complete:
//   1. "server"      — /api/health responded 200 (server is up)
//   2. "preferences" — /api/preferences fetched + active theme applied
//                      (so the first paint after splash matches the user's
//                      saved theme, not the default-emerald)
//
// SSE streams + asset cache + boot reconcile (server-side, parallel) are
// intentionally NOT in the gate — they reconnect / fill on demand, and
// waiting for them would push the splash to 3+ seconds on every launch.
// `useCatalog` is also NOT a gate — it's a "nice-to-have" for the
// AppSearch palette but list pages re-fetch on mount, so a partially-
// loaded catalog never breaks anything visible. Gating on it caused a
// 67%-stuck splash whenever any of its 10 parallel list-fetches were
// slow on cold boot; v0.2.1 Phase 3.5 dropped it from the gate and
// lets AppSearch lazy-load. The bar now reads 50% / 100% honestly.
//
// A hard 10s timeout flips the store into a "timed out" state so the
// splash can surface a "Continue anyway?" affordance instead of spinning
// forever when something's wrong (e.g., server failed to boot).

import { useEffect, useState } from "react";

export type BootCheckpoint = "server" | "preferences";

const ORDER: readonly BootCheckpoint[] = ["server", "preferences"];
const TIMEOUT_MS = 10_000;

const PHASE_LABEL: Record<BootCheckpoint, string> = {
  server: "Connecting to server…",
  preferences: "Loading preferences…",
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
