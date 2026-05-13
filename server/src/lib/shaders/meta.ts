// Bleepforge-only shader meta registry. Tracks the user-picked card
// pattern per shader at `<dataRoot>/shaders/_meta.json`. Keyed by the
// shader's project-relative path (matches what the descriptor exposes
// as `parentRel + "/" + basename`).
//
// Lifecycle: loaded into memory on first access, kept in sync by the
// PUT /api/shaders/meta endpoint. Watcher doesn't need to touch this
// — meta is Bleepforge-only and never round-trips to Godot.
//
// File format (idempotent JSON, hand-editable):
//   {
//     "shared/shaders/scanlines.gdshader": { "Pattern": "scanlines" }
//   }

import fs from "node:fs";
import path from "node:path";

import { folderAbs } from "../../config.js";
import {
  ShaderMetaRegistrySchema,
  SHADER_PATTERN_IDS,
  type ShaderMeta,
  type ShaderMetaRegistry,
  type ShaderPattern,
} from "@bleepforge/shared";

const META_FILE = path.join(folderAbs.shader, "_meta.json");

let cache: ShaderMetaRegistry | null = null;

/** Read the registry off disk (synchronously, since it's <1KB). Lazy:
 *  loaded on first call and cached in memory afterward. */
function loadRegistry(): ShaderMetaRegistry {
  if (cache) return cache;
  try {
    const text = fs.readFileSync(META_FILE, "utf8");
    const parsed = ShaderMetaRegistrySchema.parse(JSON.parse(text));
    cache = parsed;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = {};
      return cache;
    }
    // Parse / validation failures: log + start fresh rather than blocking
    // boot. The user can re-pick patterns via the UI.
    console.warn(
      `[shaders/meta] failed to parse ${META_FILE} — starting with empty registry: ${(err as Error).message}`,
    );
    cache = {};
    return cache;
  }
}

function saveRegistry(reg: ShaderMetaRegistry): void {
  fs.mkdirSync(folderAbs.shader, { recursive: true });
  // Atomic write (temp + rename) so an interrupted save doesn't corrupt
  // the registry. Same shape as the .tres writer.
  const tmp = `${META_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2), "utf8");
  fs.renameSync(tmp, META_FILE);
  cache = reg;
}

/** Look up a shader's pattern by project-relative path. Returns null if
 *  no pattern is set (caller decides the default). */
export function getShaderPattern(relPath: string): ShaderPattern | null {
  const reg = loadRegistry();
  return reg[relPath]?.Pattern ?? null;
}

/** Set a shader's pattern. Persists immediately. */
export function setShaderPattern(
  relPath: string,
  pattern: ShaderPattern,
): void {
  const reg = { ...loadRegistry() };
  reg[relPath] = { Pattern: pattern };
  saveRegistry(reg);
}

/** Remove a shader's entry (called on file unlink). No-op if absent. */
export function removeShaderMeta(relPath: string): void {
  const reg = { ...loadRegistry() };
  if (!(relPath in reg)) return;
  delete reg[relPath];
  saveRegistry(reg);
}

/** Rename a shader's entry (file moved or renamed). No-op if `from` is
 *  absent. Overwrites `to` if both happen to be set. */
export function renameShaderMeta(fromRel: string, toRel: string): void {
  const reg = { ...loadRegistry() };
  const entry = reg[fromRel];
  if (!entry) return;
  delete reg[fromRel];
  reg[toRel] = entry;
  saveRegistry(reg);
}

/** Pick a random pattern. Used when creating a new shader so each one
 *  gets a distinct default — the user can override via the picker. */
export function randomShaderPattern(): ShaderPattern {
  const idx = Math.floor(Math.random() * SHADER_PATTERN_IDS.length);
  return SHADER_PATTERN_IDS[idx]!;
}

/** Direct read access for callers that need the full registry (e.g.
 *  for a future "all patterns" export). */
export function readAllShaderMeta(): Readonly<ShaderMetaRegistry> {
  return loadRegistry();
}

export type { ShaderMeta };
