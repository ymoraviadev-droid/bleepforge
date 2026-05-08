// In-memory pub/sub for asset-watcher events. Mirrors lib/sync/eventBus.ts
// but on a separate channel — game-domain syncs and asset changes have
// different consumers (toasts vs. gallery), so we keep the streams apart
// to avoid `if (event.domain === ...)` branches everywhere downstream.

import { EventEmitter } from "node:events";

import type { AssetEvent } from "./types.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function publishAssetEvent(event: AssetEvent): void {
  emitter.emit("asset", event);
}

export function subscribeAssetEvents(
  handler: (e: AssetEvent) => void,
): () => void {
  emitter.on("asset", handler);
  return () => emitter.off("asset", handler);
}
