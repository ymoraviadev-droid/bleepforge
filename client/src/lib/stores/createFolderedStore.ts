// Folder-aware variant of createStore for domains whose API returns
// `{folder, entities}[]` groups rather than a flat list — dialogs,
// balloons, codex. The store keeps the grouped shape (so consumers
// that need folder structure don't lose it) AND maintains a derived
// flat list (so consumers that just want every entity don't repeat the
// flatMap dance).

import { useEffect, useSyncExternalStore } from "react";
import type { StoreStatus } from "./createStore";

export interface FlatEntry<E> {
  folder: string;
  entity: E;
}

export interface FolderedStoreState<G, E> {
  /** Folder groups as returned by the fetcher. */
  data: G[] | null;
  /** Pre-flattened list — one entry per entity, tagged with its folder. */
  flat: FlatEntry<E>[] | null;
  status: StoreStatus;
  error: string | null;
}

export interface FolderedStore<G, E> {
  getSnapshot: () => FolderedStoreState<G, E>;
  subscribe: (fn: () => void) => () => void;
  refresh: () => Promise<void>;
  /** Insert-or-replace one entity inside `folder`. If the folder doesn't
   *  exist yet, a new group is built via `buildGroup`. */
  patch: (folder: string, entity: E) => void;
  /** Remove by key inside `folder`. Empty folders are left in place
   *  (the user may still author into them; the file-system folder is
   *  authoritative, not the in-memory presence of entries). */
  remove: (folder: string, key: string) => void;
  ensureLoaded: () => void;
}

interface CreateOpts<G, E> {
  name: string;
  fetcher: () => Promise<G[]>;
  folderOf: (group: G) => string;
  entitiesOf: (group: G) => E[];
  keyOf: (entity: E) => string;
  /** Replace a group's entity list, returning a new group. */
  withEntities: (group: G, entities: E[]) => G;
  /** Build a fresh group for a folder we haven't seen before. Called
   *  by `patch` when the target folder isn't in the current data. */
  buildGroup: (folder: string, entities: E[]) => G;
}

function flatten<G, E>(
  data: G[],
  folderOf: (g: G) => string,
  entitiesOf: (g: G) => E[],
): FlatEntry<E>[] {
  const out: FlatEntry<E>[] = [];
  for (const g of data) {
    const folder = folderOf(g);
    for (const entity of entitiesOf(g)) out.push({ folder, entity });
  }
  return out;
}

export function createFolderedStore<G, E>(
  opts: CreateOpts<G, E>,
): FolderedStore<G, E> {
  let state: FolderedStoreState<G, E> = {
    data: null,
    flat: null,
    status: "idle",
    error: null,
  };
  const subscribers = new Set<() => void>();
  let inFlight: Promise<void> | null = null;

  function setState(next: FolderedStoreState<G, E>): void {
    state = next;
    for (const fn of subscribers) fn();
  }

  function refresh(): Promise<void> {
    if (inFlight) return inFlight;
    setState({ ...state, status: "loading", error: null });
    const p = opts
      .fetcher()
      .then((data) => {
        const flat = flatten(data, opts.folderOf, opts.entitiesOf);
        setState({ data, flat, status: "ready", error: null });
      })
      .catch((err: unknown) => {
        setState({
          ...state,
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

  function patch(folder: string, entity: E): void {
    if (!state.data) return;
    const key = opts.keyOf(entity);
    const groupIdx = state.data.findIndex((g) => opts.folderOf(g) === folder);
    let nextData: G[];
    if (groupIdx >= 0) {
      const existing = state.data[groupIdx]!;
      const entities = opts.entitiesOf(existing);
      const idx = entities.findIndex((e) => opts.keyOf(e) === key);
      const nextEntities = entities.slice();
      if (idx >= 0) nextEntities[idx] = entity;
      else nextEntities.push(entity);
      nextData = state.data.slice();
      nextData[groupIdx] = opts.withEntities(existing, nextEntities);
    } else {
      nextData = state.data.concat([opts.buildGroup(folder, [entity])]);
    }
    setState({
      data: nextData,
      flat: flatten(nextData, opts.folderOf, opts.entitiesOf),
      status: "ready",
      error: null,
    });
  }

  function remove(folder: string, key: string): void {
    if (!state.data) return;
    const groupIdx = state.data.findIndex((g) => opts.folderOf(g) === folder);
    if (groupIdx < 0) return;
    const existing = state.data[groupIdx]!;
    const nextEntities = opts
      .entitiesOf(existing)
      .filter((e) => opts.keyOf(e) !== key);
    const nextData = state.data.slice();
    nextData[groupIdx] = opts.withEntities(existing, nextEntities);
    setState({
      data: nextData,
      flat: flatten(nextData, opts.folderOf, opts.entitiesOf),
      status: "ready",
      error: null,
    });
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

export function useFolderedStore<G, E>(
  store: FolderedStore<G, E>,
): FolderedStoreState<G, E> {
  useEffect(() => {
    store.ensureLoaded();
  }, [store]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
