// In-memory ring buffer for save activity. Surfaced via /api/saves and
// the SSE stream at /api/saves/events. Captures both directions so the
// Diagnostics → Saves tab is one feed with a direction filter, not two
// side-by-side lists.
//
// Cap is 500 — bigger than the watcher's 100 because saves are the
// highest-frequency signal during active editing (rapid iteration on a
// dialog can fire dozens per minute) and the user will scroll back to
// confirm "did my last batch of edits actually round-trip cleanly."

import { publishSaveEvent, type SaveEvent } from "./eventBus.js";

const MAX_ENTRIES = 500;
const buffer: SaveEvent[] = [];

/** Append a save event and broadcast it on the bus. The two are intentionally
 *  bundled — every recorded save also pushes through SSE to any open client,
 *  so the UI updates live instead of waiting for a refresh. */
export function recordSave(event: SaveEvent): void {
  buffer.push(event);
  while (buffer.length > MAX_ENTRIES) buffer.shift();
  publishSaveEvent(event);
}

/** Snapshot in newest-first order — natural for a feed UI. */
export function listSaves(): SaveEvent[] {
  return buffer.slice().reverse();
}

/** Drops every entry. Used by the Saves tab "Clear" action. */
export function clearSaves(): void {
  buffer.length = 0;
}
