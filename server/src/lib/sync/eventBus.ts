// In-memory pub/sub for live-sync events. The watcher publishes; the SSE
// router subscribes and forwards to connected browser clients.
//
// Event shape kept flat for easy JSON serialization to the wire.

import { EventEmitter } from "node:events";

export type SyncDomain =
  | "item"
  | "karma"
  | "quest"
  | "dialog"
  | "npc"
  | "faction"
  | "balloon";

export interface SyncEvent {
  domain: SyncDomain;
  // For dialog: "<folder>/<id>". For others: the entity's primary key.
  key: string;
  action: "updated" | "deleted";
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function publishSyncEvent(event: SyncEvent): void {
  emitter.emit("sync", event);
}

export function subscribeSyncEvents(handler: (e: SyncEvent) => void): () => void {
  emitter.on("sync", handler);
  return () => emitter.off("sync", handler);
}
