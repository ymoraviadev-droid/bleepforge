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
    root: config.godotProjectRoot,
    watchedFileCount,
    // Reverse so the consumer (UI) gets newest-first — natural for a feed.
    recentEvents: recentEvents.slice().reverse(),
  };
}

export function shouldWatchTres(): boolean {
  return !!config.godotProjectRoot;
}

export function startTresWatcher(): void {
  if (watcher) return;
  if (!shouldWatchTres()) return;
  const root = config.godotProjectRoot!;

  watcher = chokidar.watch(root, {
    ignored: (path: string, stats?: Stats): boolean => {
      if (path.includes("/.godot/") || path.endsWith("/.godot")) return true;
      if (stats?.isFile() && !path.endsWith(".tres")) return true;
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
    let count = 0;
    if (watched) {
      for (const dir of Object.keys(watched)) {
        for (const f of watched[dir]!) {
          if (f.endsWith(".tres")) count++;
        }
      }
    }
    watchedFileCount = count;
    console.log(`[tres-watcher] active on ${root} — watching ${count} .tres files`);
  });
}

export function stopTresWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}

async function handleEvent(absPath: string, kind: WatcherEventKind): Promise<void> {
  if (!absPath.endsWith(".tres")) return;
  const ts = new Date().toISOString();

  if (isRecentSelfWrite(absPath)) {
    recordEvent({ ts, kind, path: absPath, outcome: "ignored-self-write" });
    return;
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
    } else {
      recordEvent({
        ts,
        kind,
        path: absPath,
        outcome: "failed",
        detail: result.error ?? "delete returned !ok",
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
    recordEvent({
      ts,
      kind,
      path: absPath,
      outcome: "reimported",
      detail: `${result.domain}=${result.key}`,
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
  }
}
