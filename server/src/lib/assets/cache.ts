// In-memory cache of every discovered image asset under the active
// project's content root. Built once at server boot via
// `rebuildAssetCache()`, kept fresh by the watcher (single-file upsert /
// remove). Read-only listing is the main API — gallery / usages search
// both pull from here.
//
// In sync mode the content root is the Godot project tree; in notebook
// mode (phase 5+) it's the Bleepforge project's own content/ dir. Cache
// shape and walking strategy are identical either way.
//
// The full-rewalk fallback is deliberately cheap (~40 images, <100ms) so
// we can afford to call it on demand if the watcher ever drops events.

import path from "node:path";

import { config } from "../../config.js";
import { discoverImages, summarizeImage } from "./discover.js";
import type { ImageAsset, ImageFormat } from "./types.js";

const cache = new Map<string, ImageAsset>();
let lastRebuildAt: number | null = null;

export function rebuildAssetCacheRunning(): boolean {
  return rebuildPromise !== null;
}

let rebuildPromise: Promise<void> | null = null;

export async function rebuildAssetCache(): Promise<void> {
  if (rebuildPromise) return rebuildPromise;
  if (!config.contentRoot) {
    cache.clear();
    return;
  }
  rebuildPromise = (async () => {
    const root = config.contentRoot!;
    const t0 = Date.now();
    try {
      const all = await discoverImages(root);
      cache.clear();
      for (const a of all) cache.set(a.path, a);
      lastRebuildAt = Date.now();
      console.log(
        `[assets] cache rebuilt: ${all.length} images in ${lastRebuildAt - t0}ms`,
      );
    } catch (err) {
      console.error(`[assets] cache rebuild failed: ${(err as Error).message}`);
    } finally {
      rebuildPromise = null;
    }
  })();
  return rebuildPromise;
}

export function listImages(): ImageAsset[] {
  return [...cache.values()];
}

export function getImage(absPath: string): ImageAsset | null {
  return cache.get(absPath) ?? null;
}

export function lastRebuiltAtIso(): string | null {
  return lastRebuildAt === null ? null : new Date(lastRebuildAt).toISOString();
}

export async function upsertImage(absPath: string): Promise<ImageAsset | null> {
  if (!config.contentRoot) return null;
  const ext = path.extname(absPath).toLowerCase();
  const format = EXT_TO_FORMAT[ext];
  if (!format) return null;
  const summary = await summarizeImage(absPath, config.contentRoot, format);
  if (summary) cache.set(absPath, summary);
  return summary;
}

export function removeImage(absPath: string): boolean {
  return cache.delete(absPath);
}

const EXT_TO_FORMAT: Record<string, ImageFormat> = {
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".webp": "webp",
  ".gif": "gif",
  ".svg": "svg",
  ".bmp": "bmp",
};
