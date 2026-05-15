// Singleton per-window cache mapping absolute image paths to their
// last-known mtime. Drives the `?v=<mtime>` cache-buster parameter on
// every asset URL — see `assetUrl` in api.ts.
//
// Why: server's /api/asset endpoint historically shipped
// `Cache-Control: no-cache, must-revalidate`. That guaranteed the
// browser revalidated every paint, but on localhost the revalidate
// round-trip is the dominant cost for tiny pixel-art files (~5-10ms ×
// 15 NPC portraits + dialog line portraits = noticeable fill-in lag
// every time the dialog graph mounts). With this cache populated,
// asset URLs carry `?v=<mtime>`; the server ships
// `Cache-Control: public, max-age=30d, immutable` for those URLs and
// the browser serves cached bytes without any revalidate. Edits flip
// the mtime → URL changes → browser fetches fresh.
//
// Population paths:
//   - prefetchMtimes() at app boot (one /api/assets/images call)
//   - SSE asset events on add / change (`change` lacks the new mtime,
//     so we stamp Date.now() — close enough to force a URL change,
//     and the next prefetch / list-load will overwrite with the real
//     value)
//   - removed events drop the entry (next render falls back to the
//     legacy no-cache URL, which is fine for a stale reference)
//   - importImage / image-editor save paths in api.ts also stamp
//     Date.now() locally so the URL changes BEFORE the SSE event
//     arrives — eliminates the brief window where the user sees
//     stale bytes right after saving.

import { assetsApi } from "../api";

const cache = new Map<string, number>();

export function getAssetMtime(path: string): number | undefined {
  return cache.get(path);
}

export function setAssetMtime(path: string, mtime: number): void {
  cache.set(path, mtime);
}

export function bumpAssetMtime(path: string): void {
  cache.set(path, Date.now());
}

export function invalidateAssetMtime(path: string): void {
  cache.delete(path);
}

let prefetched = false;
let inFlight: Promise<void> | null = null;

/** Wipe the cache + arm a fresh prefetch on the next caller. Used by
 *  the hot-reload path on project switch — new project has different
 *  asset paths, and the prefetched-once flag would otherwise keep us
 *  on the old project's mtime map. */
export function resetAssetMtimeCache(): void {
  cache.clear();
  prefetched = false;
  inFlight = null;
}

/** Populates the cache from /api/assets/images. Idempotent — concurrent
 *  callers share the in-flight promise. */
export function prefetchAssetMtimes(): Promise<void> {
  if (prefetched) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = assetsApi
    .listImages()
    .then((r) => {
      for (const img of r.images) cache.set(img.path, img.mtimeMs);
      prefetched = true;
    })
    .catch((err) => {
      // Non-fatal: without prefetch, URLs fall back to the no-cache
      // path. The first nav per image fetches fresh; subsequent ones
      // get cached once the SSE add event populates the cache.
      console.warn("[assets] mtime prefetch failed:", err);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

let wired = false;

/** Wires SSE asset events into the cache. Call once at app boot. */
export function wireAssetMtimeCache(): void {
  if (wired) return;
  wired = true;
  window.addEventListener("Bleepforge:asset", (e) => {
    const { kind, path } = e.detail;
    if (kind === "removed") {
      cache.delete(path);
    } else {
      // `added` and `changed`: the event payload doesn't include the
      // new mtime, so stamp Date.now(). The URL change is what
      // matters; the server reads bytes from disk afresh on the next
      // request, so the user sees the latest content regardless of
      // exact mtime accuracy in the cache.
      cache.set(path, Date.now());
    }
  });
}
