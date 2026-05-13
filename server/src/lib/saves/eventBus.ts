// In-memory pub/sub for save events. Mirrors sync/eventBus.ts but on a
// distinct channel: saves cover both directions (Bleepforge → Godot writes
// and Godot → Bleepforge reimports), while the sync bus only carries the
// watcher's incoming reimports. Keeping them separate means outgoing saves
// (which the user just triggered themselves) don't show up as toasts —
// they only go where they're useful: the Diagnostics → Saves feed.

import { EventEmitter } from "node:events";
import type { SyncDomain } from "../sync/eventBus.js";

export type SaveDirection = "outgoing" | "incoming";
export type SaveOutcome = "ok" | "warning" | "error";
export type SaveAction = "updated" | "deleted";

// SaveDomain extends SyncDomain with three Bleepforge-only domains that
// don't have a .tres watcher counterpart (v0.2.2). These are still
// user-initiated saves worth recording in the Saves audit feed AND
// surfacing as outgoing-save toasts; the sync stream just doesn't
// carry them because there's no "external" side to sync from.
//   - concept: the singleton concept doc (data/concept.json)
//   - codex-entry: one Codex entry per save
//   - codex-category: the per-category _meta.json schema definition
// Continuous / noisy saves (preferences slider drags, dialog graph
// layout writes, shader card-pattern picks) deliberately stay out of
// this list — they'd flood the feed and toast-bridge.
export type SaveDomain =
  | SyncDomain
  | "concept"
  | "codex-entry"
  | "codex-category";

export interface SaveEvent {
  ts: string;
  direction: SaveDirection;
  domain: SaveDomain;
  // For dialog: "<folder>/<id>". For others: the entity's primary key.
  key: string;
  // Outgoing is always "updated" (no .tres deletion). Incoming may be
  // "deleted" when the watcher sees an unlink and clears the JSON cache.
  action: SaveAction;
  outcome: SaveOutcome;
  // Absolute .tres path (when known). Outgoing saves know it from the
  // writer result; incoming saves know it from the watcher event.
  path?: string;
  // Populated when outcome === "warning" — orphan ext_resource cleanup,
  // texture UID lookups that fell through, etc. Surfaced in the row's
  // expanded detail.
  warnings?: string[];
  // Populated when outcome === "error". For outgoing: the writer threw.
  // For incoming: reimportOne returned !ok with a reason.
  error?: string;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function publishSaveEvent(event: SaveEvent): void {
  emitter.emit("save", event);
}

export function subscribeSaveEvents(
  handler: (e: SaveEvent) => void,
): () => void {
  emitter.on("save", handler);
  return () => emitter.off("save", handler);
}
