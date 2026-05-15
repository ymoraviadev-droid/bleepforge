// Per-folder DialogLayout cache. Lives outside the DialogGraph component
// so the layout survives unmount-remount (clicking away from /dialogs
// and back). Without this the layout fetch fires on every nav even
// when the data is byte-for-byte identical to last time.
//
// Layouts aren't part of the dialog store (they're authored Bleepforge-
// side, separately from sequences — drag-stop saves them without
// touching .tres). Keeping them in their own cache rather than
// extending the store keeps the store's shape clean and the layout
// save path unchanged.
//
// Invalidation: SSE dialog events drop the entry for the affected
// folder. Local writes (drag-stop, edge-style change) update the
// cache via `setDialogLayout` so the next mount sees the latest.

import type { DialogLayout } from "../../lib/api";

const cache = new Map<string, DialogLayout>();

export function getDialogLayout(folder: string): DialogLayout | undefined {
  return cache.get(folder);
}

export function setDialogLayout(folder: string, layout: DialogLayout): void {
  cache.set(folder, layout);
}

export function invalidateDialogLayout(folder: string): void {
  cache.delete(folder);
}

export function clearDialogLayoutCache(): void {
  cache.clear();
}
