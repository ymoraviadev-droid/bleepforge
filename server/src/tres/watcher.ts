// Watches GODOT_PROJECT_ROOT for .tres changes via chokidar (cross-platform,
// reliable across deep subtrees, handles atomic-rename saves like Godot's).
// On change: re-import that single file (so Bleepforge's JSON catches up)
// and publish a sync event for any connected SSE clients to refetch.
//
// Self-write suppression (via writer.ts's recentSelfWrites map) prevents
// our own save flow from triggering a useless re-import loop.

import chokidar, { type FSWatcher } from "chokidar";
import { join } from "node:path";

import { config } from "../config.js";
import { publishSyncEvent } from "../sync/eventBus.js";
import { detectDomain, deleteJsonFor, reimportOne } from "./reimportOne.js";
import { isRecentSelfWrite } from "./writer.js";

let watcher: FSWatcher | null = null;

export function shouldWatchTres(): boolean {
  return process.env.WATCH_TRES === "1" && !!config.godotProjectRoot;
}

export function startTresWatcher(): void {
  if (watcher) return;
  if (!shouldWatchTres()) return;
  const root = config.godotProjectRoot!;

  // Watch only `.tres` files under the project root, ignoring the .godot
  // cache directory (lots of churn from Godot's import pipeline; nothing
  // we care about lives in there).
  watcher = chokidar.watch(`${root}/**/*.tres`, {
    ignored: (p) => p.includes(`${root}/.godot/`) || p.includes("/.godot/"),
    ignoreInitial: true, // don't fire for files that already exist at startup
    awaitWriteFinish: {
      // Godot saves via temp file + rename. Wait for size to stabilize
      // before treating the file as "ready" — this collapses the noisy
      // create/rename/change burst into a single event.
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  watcher.on("add", (path) => void handleEvent(path, "add"));
  watcher.on("change", (path) => void handleEvent(path, "change"));
  watcher.on("unlink", (path) => void handleEvent(path, "unlink"));
  watcher.on("error", (err) => {
    console.error(`[tres-watcher] error: ${(err as Error).message}`);
  });
  watcher.on("ready", () => {
    console.log(`[tres-watcher] active on ${root} (chokidar)`);
  });
}

export function stopTresWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}

async function handleEvent(absPath: string, kind: "add" | "change" | "unlink"): Promise<void> {
  // Defensive — chokidar's glob already filters but be explicit.
  if (!absPath.endsWith(".tres")) return;

  if (isRecentSelfWrite(absPath)) {
    // Bleepforge wrote this file via WRITE_TRES. Skip — our JSON is
    // already what we just emitted, no re-import needed.
    return;
  }

  const detected = detectDomain(absPath);
  if (!detected) return; // not an authored domain we track

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
    }
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
  } else {
    console.log(`[tres-watcher] reimport failed for ${absPath}: ${result.error}`);
  }
}

// Suppress unused-import warning when join is no longer used (kept for
// future helpers).
void join;
