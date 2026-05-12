// In-memory pub/sub for shader-watcher events. Fourth SSE channel after
// sync (game-domain saves) / saves (audit feed) / assets (image deltas).
// Kept on its own channel rather than folded into the asset stream
// because the consumer set is different — shader cards re-render on
// shader events, asset cards on asset events — and avoiding a discriminator
// branch on every receiver beats the marginal cost of a fourth EventSource.
//
// Self-write suppression is handled at the watcher boundary (see
// selfWrite.ts in this folder) so writes initiated by Bleepforge's own
// PUT / POST / DELETE endpoints don't echo back as spurious "external
// change" banners on the edit page that just saved.

import { EventEmitter } from "node:events";

import type { ShaderEvent } from "./types.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function publishShaderEvent(event: ShaderEvent): void {
  emitter.emit("shader", event);
}

export function subscribeShaderEvents(
  handler: (e: ShaderEvent) => void,
): () => void {
  emitter.on("shader", handler);
  return () => emitter.off("shader", handler);
}
