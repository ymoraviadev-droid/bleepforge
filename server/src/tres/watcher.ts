// Watches GODOT_PROJECT_ROOT for .tres changes via chokidar.
//
// chokidar v5 dropped glob support — pass the root directory and filter via
// the `ignored` predicate. We ignore non-.tres files and the .godot cache
// directory (lots of churn from Godot's import pipeline; nothing we want).
//
// Self-write suppression (via writer.ts's recentSelfWrites map) prevents
// our own save flow from triggering a useless re-import loop.

import chokidar, { type FSWatcher } from "chokidar";
import type { Stats } from "node:fs";

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

  watcher = chokidar.watch(root, {
    ignored: (path: string, stats?: Stats): boolean => {
      // Ignore the .godot cache anywhere.
      if (path.includes("/.godot/") || path.endsWith("/.godot")) return true;
      // For files: only watch .tres. (For directories, return false so we
      // descend into them and find the .tres files inside.)
      if (stats?.isFile() && !path.endsWith(".tres")) return true;
      return false;
    },
    ignoreInitial: true, // don't fire for files that already exist at startup
    awaitWriteFinish: {
      // Godot saves via temp file + rename. Wait for size to stabilize so
      // the file is fully written before we react.
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
    const watched = watcher?.getWatched();
    let count = 0;
    if (watched) {
      for (const dir of Object.keys(watched)) {
        for (const f of watched[dir]!) {
          if (f.endsWith(".tres")) count++;
        }
      }
    }
    console.log(`[tres-watcher] active on ${root} — watching ${count} .tres files`);
  });
}

export function stopTresWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}

async function handleEvent(absPath: string, kind: "add" | "change" | "unlink"): Promise<void> {
  if (!absPath.endsWith(".tres")) return;

  if (isRecentSelfWrite(absPath)) {
    return;
  }

  const detected = detectDomain(absPath);
  if (!detected) return;

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
