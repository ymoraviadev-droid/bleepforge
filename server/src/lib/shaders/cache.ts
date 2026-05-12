// In-memory cache of every discovered .gdshader under the Godot project.
// Built once at server boot via `rebuildShaderCache()`, kept fresh by the
// watcher (single-file upsert / remove). Lookups go through here so the
// list endpoint stays sub-millisecond once the cache is warm and the
// SSE stream has a stable source to compare against.
//
// Same shape as lib/assets/cache.ts; corpus today is tiny (single-digit
// shaders) so the full-rewalk fallback is essentially free, but the cache
// earns its keep once the watcher starts pushing deltas — without it
// every event would re-walk the project.

import { config } from "../../config.js";
import { discoverShaders, summarizeShader } from "./discover.js";
import type { ShaderAsset } from "./types.js";

const cache = new Map<string, ShaderAsset>();
let lastRebuildAt: number | null = null;
let rebuildPromise: Promise<void> | null = null;

export async function rebuildShaderCache(): Promise<void> {
  if (rebuildPromise) return rebuildPromise;
  if (!config.godotProjectRoot) {
    cache.clear();
    return;
  }
  rebuildPromise = (async () => {
    const root = config.godotProjectRoot!;
    const t0 = Date.now();
    try {
      const all = await discoverShaders(root);
      cache.clear();
      for (const s of all) cache.set(s.path, s);
      lastRebuildAt = Date.now();
      console.log(
        `[shaders] cache rebuilt: ${all.length} shaders in ${lastRebuildAt - t0}ms`,
      );
    } catch (err) {
      console.error(
        `[shaders] cache rebuild failed: ${(err as Error).message}`,
      );
    } finally {
      rebuildPromise = null;
    }
  })();
  return rebuildPromise;
}

export function listShaders(): ShaderAsset[] {
  return [...cache.values()];
}

export function getShader(absPath: string): ShaderAsset | null {
  return cache.get(absPath) ?? null;
}

export function lastRebuiltAtIso(): string | null {
  return lastRebuildAt === null ? null : new Date(lastRebuildAt).toISOString();
}

export async function upsertShader(absPath: string): Promise<ShaderAsset | null> {
  if (!config.godotProjectRoot) return null;
  if (!absPath.endsWith(".gdshader")) return null;
  const summary = await summarizeShader(absPath, config.godotProjectRoot);
  if (summary) cache.set(absPath, summary);
  return summary;
}

export function removeShader(absPath: string): boolean {
  return cache.delete(absPath);
}
