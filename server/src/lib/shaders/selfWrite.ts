// Tracks paths Bleepforge wrote recently so the watcher's recordSave call
// can skip the duplicate "incoming" entry for our own outgoing save. NOT
// used to suppress the SSE event or cache update — those intentionally
// fire on every change so other windows refresh. This is purely about
// the Saves activity feed: a single Bleepforge save shouldn't appear
// twice (once as outgoing, once as incoming) in the same feed.
//
// Mirrors writer.ts's recentSelfWrites map but kept shader-local so the
// .tres self-write semantics (which also gate the entire reimport
// pipeline) stay separate from the looser shader semantics.

import path from "node:path";

import { config } from "../../config.js";

const TTL_MS = 1500;
const recent = new Map<string, number>();

/** Project-relative identifier used as the SaveEvent.key for shader saves.
 *  Mirrors how dialog uses "<folder>/<id>" — a stable, human-readable
 *  handle that the Saves tab renders in the row body. The absolute path
 *  travels alongside it in SaveEvent.path; the route builder uses the
 *  latter to construct the /shaders/edit?path=... link. */
export function shaderSaveKey(absPath: string): string {
  if (!config.contentRoot) return path.basename(absPath);
  const rel = path.relative(config.contentRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return path.basename(absPath);
  return rel;
}

export function noteShaderSelfWrite(absPath: string): void {
  recent.set(absPath, Date.now());
  if (recent.size > 200) {
    const cutoff = Date.now() - TTL_MS;
    for (const [p, ts] of recent) {
      if (ts < cutoff) recent.delete(p);
    }
  }
}

export function isRecentShaderSelfWrite(absPath: string): boolean {
  const ts = recent.get(absPath);
  if (!ts) return false;
  if (Date.now() - ts > TTL_MS) {
    recent.delete(absPath);
    return false;
  }
  return true;
}
