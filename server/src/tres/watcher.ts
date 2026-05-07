// Watches GODOT_PROJECT_ROOT for .tres changes. On change: re-import that
// single file (so Bleepforge's JSON catches up) and publish a sync event
// for any connected SSE clients to refetch.
//
// Self-write suppression (via writer.ts's recentSelfWrites map) prevents
// our own save flow from triggering a useless re-import loop.

import { stat } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

import { config } from "../config.js";
import { publishSyncEvent } from "../sync/eventBus.js";
import { detectDomain, deleteJsonFor, reimportOne } from "./reimportOne.js";
import { isRecentSelfWrite } from "./writer.js";

const DEBOUNCE_MS = 200;

let watcher: FSWatcher | null = null;
const pending = new Map<string, NodeJS.Timeout>();

export function shouldWatchTres(): boolean {
  return process.env.WATCH_TRES === "1" && !!config.godotProjectRoot;
}

export function startTresWatcher(): void {
  if (watcher) return;
  if (!shouldWatchTres()) return;
  const root = config.godotProjectRoot!;

  try {
    watcher = watch(root, { recursive: true }, (_evt, filename) => {
      if (!filename) return;
      const rel = filename.toString();
      if (!rel.endsWith(".tres")) return;
      // Skip generated cache.
      if (rel.startsWith(".godot/") || rel.includes("/.godot/")) return;

      const abs = join(root, rel);
      // Debounce per-file: rapid-fire change/rename events get coalesced.
      const existing = pending.get(abs);
      if (existing) clearTimeout(existing);
      pending.set(
        abs,
        setTimeout(() => {
          pending.delete(abs);
          void handleEvent(abs);
        }, DEBOUNCE_MS),
      );
    });
    watcher.on("error", (err) => {
      console.error(`[tres-watcher] error: ${(err as Error).message}`);
    });
    console.log(`[tres-watcher] active on ${root} (recursive)`);
  } catch (err) {
    console.error(`[tres-watcher] failed to start: ${(err as Error).message}`);
  }
}

export function stopTresWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
}

async function handleEvent(absPath: string): Promise<void> {
  if (isRecentSelfWrite(absPath)) {
    // Bleepforge wrote this file via WRITE_TRES. Skip — our JSON is
    // already what we just emitted, no re-import needed.
    return;
  }

  const detected = detectDomain(absPath);
  if (!detected) return; // not an authored domain we track

  let exists = false;
  try {
    await stat(absPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
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
  } else {
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
  }
}
