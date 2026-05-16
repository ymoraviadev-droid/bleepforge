// Watches GODOT_PROJECT_ROOT for .tres, image-asset, and .gdshader
// changes via chokidar. Three routes off one stream:
//   - .tres → reimport into JSON cache, publish a SyncEvent for game-data
//     listeners (toasts, list refreshes).
//   - images (.png / .svg / …) → upsert the asset cache, publish an
//     AssetEvent for the gallery to refresh in place.
//   - .gdshader → upsert the shader cache, publish a ShaderEvent for
//     the shader gallery + edit page to react.
// Anything else (the .godot cache, .import sidecars, .uid files, scripts)
// is filtered at the chokidar level so we don't pay event cost for them.
//
// Self-write suppression (via writer.ts's recentSelfWrites map) prevents
// our own .tres save flow from triggering a useless re-import loop. The
// shader path deliberately does NOT suppress self-writes: cache + SSE
// fire on every write, so a save in window A shows up in window B's
// shader list. The saving window's edit page handles "don't show an
// external-change banner against my own save" via a dirty check in
// useShaderRefresh's callback.

import chokidar, { type FSWatcher } from "chokidar";
import type { Stats } from "node:fs";

import { MANIFEST_FILENAME } from "@bleepforge/shared";
import { config, isSyncMode } from "../../config.js";
import { removeImage, upsertImage } from "../../lib/assets/cache.js";
import { isImagePath } from "../../lib/assets/discover.js";
import { publishAssetEvent } from "../../lib/assets/eventBus.js";
import { manifestCache } from "../../lib/manifest/cache.js";
import { projectIndex } from "../../lib/projectIndex/index.js";
import { recordSave } from "../../lib/saves/buffer.js";
import { removeShader, upsertShader } from "../../lib/shaders/cache.js";
import { publishShaderEvent } from "../../lib/shaders/eventBus.js";
import {
  isRecentShaderSelfWrite,
  shaderSaveKey,
} from "../../lib/shaders/selfWrite.js";
import { publishSyncEvent } from "../../lib/sync/eventBus.js";
import { detectDomain, deleteJsonFor, reimportOne } from "./reimportOne.js";
import { isRecentSelfWrite } from "./writer.js";

let watcher: FSWatcher | null = null;
let watchedFileCount = 0;

// Per-path debounce timers. Coalesces Godot's atomic-rename burst
// (typically unlink + add fired in quick succession) into a single
// reimport. Replaces chokidar's awaitWriteFinish, which has a known
// stuck-state issue when a saved file's byte size doesn't change.
const DEBOUNCE_MS = 150;
const pending = new Map<string, NodeJS.Timeout>();

// Recent-events ring for the Diagnostics → Watcher tab. Captures every
// post-debounce event with its outcome so the user can see at a glance
// whether the watcher is firing as expected. Buffer is small — older
// events roll out — because the Logs tab is the canonical history.
export type WatcherEventKind = "add" | "change" | "unlink";
export type WatcherEventOutcome =
  | "reimported"
  | "deleted"
  | "ignored-self-write"
  | "ignored-not-domain"
  | "failed";

export interface WatcherEvent {
  ts: string;
  kind: WatcherEventKind;
  path: string;
  outcome: WatcherEventOutcome;
  detail?: string;
}

const MAX_EVENTS = 100;
const recentEvents: WatcherEvent[] = [];

function recordEvent(e: WatcherEvent): void {
  recentEvents.push(e);
  while (recentEvents.length > MAX_EVENTS) recentEvents.shift();
}

export function watcherStatus(): {
  active: boolean;
  root: string | null;
  watchedFileCount: number;
  recentEvents: WatcherEvent[];
} {
  return {
    active: watcher !== null,
    root: config.contentRoot,
    watchedFileCount,
    // Reverse so the consumer (UI) gets newest-first — natural for a feed.
    recentEvents: recentEvents.slice().reverse(),
  };
}

export function shouldWatchTres(): boolean {
  return !!config.contentRoot;
}

export function startTresWatcher(): void {
  if (watcher) return;
  if (!shouldWatchTres()) return;
  // Watch contentRoot, not godotProjectRoot. In sync mode they're equal
  // (the Godot tree IS the content root); in notebook mode (phase 5+)
  // this is the Bleepforge project's content/ dir — only image + shader
  // events fire there since .tres/.tscn don't live in notebook content.
  const root = config.contentRoot!;

  watcher = chokidar.watch(root, {
    ignored: (p: string, stats?: Stats): boolean => {
      if (p.includes("/.godot/") || p.endsWith("/.godot")) return true;
      if (stats?.isFile()) {
        // Pass through .tres + .tscn + image files + .gdshader. .tscn is
        // here for the pickup catalog (a .tscn whose root node has
        // DbItemName counts as a pickup; the projectIndex picks this up).
        // Filter everything else (sidecars incl. .gdshader.uid, scripts —
        // the watcher feeds four cache pipelines and only those file types
        // matter).
        if (p.endsWith(".tres")) return false;
        if (p.endsWith(".tscn")) return false;
        if (isImagePath(p)) return false;
        if (p.endsWith(".gdshader")) return false;
        // Manifest file (one specific filename at the project root).
        // Catches both edits from the godot-lib emitter (Tools menu, build
        // hook, editor-load auto-export) AND hand-edits during dev.
        if (p.endsWith(`/${MANIFEST_FILENAME}`)) return false;
        return true;
      }
      return false;
    },
    ignoreInitial: true,
    // No awaitWriteFinish — relying on our own debounce below.
  });

  const schedule = (path: string, kind: "add" | "change" | "unlink") => {
    const existing = pending.get(path);
    if (existing) clearTimeout(existing);
    pending.set(
      path,
      setTimeout(() => {
        pending.delete(path);
        void handleEvent(path, kind);
      }, DEBOUNCE_MS),
    );
  };

  watcher.on("add", (path) => schedule(path, "add"));
  watcher.on("change", (path) => schedule(path, "change"));
  watcher.on("unlink", (path) => schedule(path, "unlink"));
  watcher.on("error", (err) => {
    console.error(`[tres-watcher] error: ${(err as Error).message}`);
  });
  watcher.on("ready", () => {
    const watched = watcher?.getWatched();
    let tresCount = 0;
    let imageCount = 0;
    let shaderCount = 0;
    if (watched) {
      for (const dir of Object.keys(watched)) {
        for (const f of watched[dir]!) {
          if (f.endsWith(".tres")) tresCount++;
          else if (f.endsWith(".gdshader")) shaderCount++;
          else if (isImagePath(f)) imageCount++;
        }
      }
    }
    watchedFileCount = tresCount;
    console.log(
      `[tres-watcher] active on ${root} — watching ${tresCount} .tres + ${imageCount} images + ${shaderCount} shaders`,
    );
  });
}

export function stopTresWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}

async function handleEvent(absPath: string, kind: WatcherEventKind): Promise<void> {
  // Manifest file: refresh the in-memory cache. Affects projectIndex's
  // manifest-derived classifiers + any consumer of manifestCache.get().
  // No SSE event for now — manifest changes are rare (per godot-lib's
  // export triggers: editor open / Tools menu / build hook) and the
  // consumers that care (generic mapper, projectIndex) re-read on
  // demand. If a future feature needs reactive manifest awareness,
  // publish here.
  if (absPath.endsWith(`/${MANIFEST_FILENAME}`)) {
    if (kind === "unlink") {
      manifestCache.reset();
      console.log(`[tres-watcher] manifest removed`);
    } else {
      await manifestCache.refresh();
      const s = manifestCache.status();
      console.log(
        `[tres-watcher] manifest ${kind}: ${s.domains} domain(s), ${s.subResources} sub-resource(s)`,
      );
    }
    return;
  }

  // Image files take a separate, much simpler path: refresh the asset
  // cache entry and publish an AssetEvent. No domain detection, no
  // self-write suppression (Bleepforge doesn't write images yet — Phase 3).
  if (isImagePath(absPath)) {
    if (kind === "unlink") {
      if (removeImage(absPath)) {
        publishAssetEvent({ kind: "removed", path: absPath });
      }
      return;
    }
    const updated = await upsertImage(absPath);
    if (updated) {
      publishAssetEvent({
        kind: kind === "add" ? "added" : "changed",
        path: absPath,
      });
    }
    return;
  }

  // Shader files: same shape as image route. No self-write suppression
  // here — even when Bleepforge initiated the write, we want the cache
  // to update + the SSE event to fire so other windows refresh. The
  // saving window's own edit page handles "don't show an external-change
  // banner against my own save" via a dirty check in useShaderRefresh's
  // callback, not by hiding the event.
  //
  // The Saves activity feed IS gated on self-write though — without it,
  // every Bleepforge save would show up twice (once as outgoing from the
  // shader router, once as incoming from this branch). The cache/SSE
  // still fire; only the recordSave call below is skipped.
  if (absPath.endsWith(".gdshader")) {
    const ts = new Date().toISOString();
    const key = shaderSaveKey(absPath);
    if (kind === "unlink") {
      const removedFromCache = removeShader(absPath);
      if (removedFromCache) {
        publishShaderEvent({ kind: "removed", path: absPath });
      }
      if (!isRecentShaderSelfWrite(absPath)) {
        recordSave({
          ts,
          direction: "incoming",
          domain: "shader",
          key,
          action: "deleted",
          outcome: "ok",
          path: absPath,
        });
      }
      return;
    }
    const updated = await upsertShader(absPath);
    if (updated) {
      publishShaderEvent({
        kind: kind === "add" ? "added" : "changed",
        path: absPath,
      });
    }
    if (!isRecentShaderSelfWrite(absPath)) {
      recordSave({
        ts,
        direction: "incoming",
        domain: "shader",
        key,
        action: "updated",
        outcome: "ok",
        path: absPath,
      });
    }
    return;
  }

  // .tscn files: pickup-catalog only. Keep the ProjectIndex live so the
  // /api/pickups endpoint reflects scenes added/removed at runtime. No
  // SSE event (today nothing in the UI subscribes to pickup changes
  // beyond an immediate refetch) — same shape as the watch hook that
  // used to call invalidatePickupCache().
  // Defensive sync-mode gate: notebook content/ dirs shouldn't carry
  // .tscn files; if one shows up we leave the projectIndex alone so it
  // can't pick up stray sync-shaped entries.
  if (absPath.endsWith(".tscn")) {
    if (!isSyncMode()) return;
    if (kind === "unlink") {
      projectIndex.remove(absPath);
    } else {
      await projectIndex.upsert(absPath);
    }
    return;
  }

  if (!absPath.endsWith(".tres")) return;
  // Same defensive gate for .tres. The reimport pipeline is sync-only;
  // a .tres dropped into a notebook content/ dir is treated as an alien
  // and ignored.
  if (!isSyncMode()) return;
  const ts = new Date().toISOString();

  if (isRecentSelfWrite(absPath)) {
    recordEvent({ ts, kind, path: absPath, outcome: "ignored-self-write" });
    // Still keep the index in sync — a self-write changes the file's
    // content (and possibly its identity), so even when we skip the
    // reimport path the index needs to reflect the new state for the
    // next save's lookups.
    if (kind === "unlink") {
      projectIndex.remove(absPath);
    } else {
      await projectIndex.upsert(absPath);
    }
    return;
  }

  // External change. Update the index FIRST for add/change so detectDomain
  // (which reads from the index) sees the latest classification. For
  // unlink we keep the entry in the index until detectDomain can read it
  // — the deleteJsonFor pass below needs the canonical key, which we
  // recover from the still-present entry. We remove from the index after
  // the JSON delete completes.
  if (kind !== "unlink") {
    await projectIndex.upsert(absPath);
  }

  const detected = detectDomain(absPath);
  if (!detected) {
    recordEvent({ ts, kind, path: absPath, outcome: "ignored-not-domain" });
    return;
  }

  if (kind === "unlink") {
    const result = await deleteJsonFor(absPath);
    if (result.ok && result.domain && result.key) {
      console.log(
        `[tres-watcher] deleted JSON for ${result.domain}=${result.key} (matching ${absPath} was removed)`,
      );
      publishSyncEvent({
        domain: result.domain,
        key: result.key,
        action: "deleted",
      });
      recordEvent({
        ts,
        kind,
        path: absPath,
        outcome: "deleted",
        detail: `${result.domain}=${result.key}`,
      });
      recordSave({
        ts,
        direction: "incoming",
        domain: result.domain,
        key: result.key,
        action: "deleted",
        outcome: "ok",
        path: absPath,
      });
    } else {
      recordEvent({
        ts,
        kind,
        path: absPath,
        outcome: "failed",
        detail: result.error ?? "delete returned !ok",
      });
      // Use the domain/key from detectDomain so the failure still
      // surfaces in the Saves feed with enough context to act on.
      recordSave({
        ts,
        direction: "incoming",
        domain: detected.domain,
        key: detected.key,
        action: "deleted",
        outcome: "error",
        path: absPath,
        error: result.error ?? "delete returned !ok",
      });
    }
    // Now safe to drop from the index — detectDomain has read what it
    // needed. Subsequent lookups by id will return null, which is the
    // correct post-delete state.
    projectIndex.remove(absPath);
    return;
  }

  const result = await reimportOne(absPath);
  if (result.ok && result.domain && result.key) {
    console.log(
      `[tres-watcher] reimported ${result.domain}=${result.key} from ${absPath}`,
    );
    publishSyncEvent({
      domain: result.domain,
      key: result.key,
      action: "updated",
    });
    recordEvent({
      ts,
      kind,
      path: absPath,
      outcome: "reimported",
      detail: `${result.domain}=${result.key}`,
    });
    recordSave({
      ts,
      direction: "incoming",
      domain: result.domain,
      key: result.key,
      action: "updated",
      outcome: "ok",
      path: absPath,
    });
  } else {
    console.log(`[tres-watcher] reimport failed for ${absPath}: ${result.error}`);
    recordEvent({
      ts,
      kind,
      path: absPath,
      outcome: "failed",
      detail: result.error,
    });
    recordSave({
      ts,
      direction: "incoming",
      domain: detected.domain,
      key: detected.key,
      action: "updated",
      outcome: "error",
      path: absPath,
      error: result.error,
    });
  }
}
