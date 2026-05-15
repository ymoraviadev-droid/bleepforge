// Generic singleton store factory for a flat list of entities (one fetcher,
// list-shaped). Each store is a module-level singleton — multiple
// `useStore(store)` mounts share the same data, the same in-flight fetch
// promise, and the same SSE-driven refresh signal.
//
// Why this exists: pre-v0.2.5 the catalog ran 10 parallel fetches per
// `useCatalog()` mount, and `useCatalog()` was mounted in 4-7 places.
// Singleton stores collapse that to one fetch per domain regardless of
// how many consumers ask for the data.
//
// React integration is via `useSyncExternalStore` (React 18+ built-in).
// No external state library.

import { useEffect, useSyncExternalStore } from "react";

export type StoreStatus = "idle" | "loading" | "ready" | "error";

export interface StoreState<T> {
  data: T[] | null;
  status: StoreStatus;
  error: string | null;
}

export interface Store<T> {
  /** Current snapshot. Stable reference between notifies — safe for
   *  `useSyncExternalStore`. */
  getSnapshot: () => StoreState<T>;
  /** Subscribe to state changes. Returns unsubscribe. */
  subscribe: (fn: () => void) => () => void;
  /** Force a refetch. In-flight calls are deduped — concurrent callers
   *  share the same promise. */
  refresh: () => Promise<void>;
  /** Insert-or-replace one entity by key. Used by save responses so the
   *  local cache updates without a refetch round-trip. No-op when no data
   *  has been loaded yet (the next mount will fetch fresh). */
  patch: (entity: T) => void;
  /** Remove by key. No-op when no data has been loaded yet. */
  remove: (key: string) => void;
  /** Lazy boot — kicks off the first refetch if nothing's been loaded
   *  yet. Idempotent; safe to call from any mount. */
  ensureLoaded: () => void;
}

interface CreateOpts<T> {
  name: string;
  fetcher: () => Promise<T[]>;
  keyOf: (entity: T) => string;
}

export function createStore<T>(opts: CreateOpts<T>): Store<T> {
  let state: StoreState<T> = { data: null, status: "idle", error: null };
  const subscribers = new Set<() => void>();
  let inFlight: Promise<void> | null = null;

  function setState(next: StoreState<T>): void {
    state = next;
    for (const fn of subscribers) fn();
  }

  function refresh(): Promise<void> {
    if (inFlight) return inFlight;
    setState({ data: state.data, status: "loading", error: null });
    const p = opts
      .fetcher()
      .then((data) => {
        setState({ data, status: "ready", error: null });
      })
      .catch((err: unknown) => {
        setState({
          data: state.data,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = p;
    return p;
  }

  function patch(entity: T): void {
    if (!state.data) return;
    const key = opts.keyOf(entity);
    const idx = state.data.findIndex((e) => opts.keyOf(e) === key);
    const next = state.data.slice();
    if (idx >= 0) next[idx] = entity;
    else next.push(entity);
    setState({ data: next, status: "ready", error: null });
  }

  function remove(key: string): void {
    if (!state.data) return;
    const next = state.data.filter((e) => opts.keyOf(e) !== key);
    setState({ data: next, status: "ready", error: null });
  }

  function ensureLoaded(): void {
    if (state.status === "idle") void refresh();
  }

  return {
    getSnapshot: () => state,
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    refresh,
    patch,
    remove,
    ensureLoaded,
  };
}

/** Hook that subscribes a component to a store. Triggers lazy load on
 *  first mount; returns the current state, re-rendering when it changes. */
export function useStore<T>(store: Store<T>): StoreState<T> {
  useEffect(() => {
    store.ensureLoaded();
  }, [store]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
