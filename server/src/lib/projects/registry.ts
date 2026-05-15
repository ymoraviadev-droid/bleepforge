// Project registry + active-project pointer I/O. Two files at the
// Bleepforge root (= parent of dataRoot — `dialoguer/` in dev,
// `~/.config/Bleepforge/` in packaged mode):
//
//   projects.json         { schemaVersion: 1, projects: [...] }
//   active-project.json   { schemaVersion: 1, activeSlug, lastSwitched }
//
// Both are written atomically (temp + rename) and read with safe-parse so
// a malformed file falls back to empty rather than crashing the server.
//
// This module is intentionally pure I/O — no migration logic, no path
// resolution. The migration module composes the writes; config.ts reads
// the active project to derive its dataRoot.

import fs from "node:fs";
import path from "node:path";
import {
  ActiveProjectPointerSchema,
  ProjectRegistrySchema,
  type ActiveProjectPointer,
  type Project,
  type ProjectRegistry,
} from "@bleepforge/shared";

export const REGISTRY_FILENAME = "projects.json";
export const ACTIVE_POINTER_FILENAME = "active-project.json";

export function registryPath(bleepforgeRoot: string): string {
  return path.join(bleepforgeRoot, REGISTRY_FILENAME);
}

export function activePointerPath(bleepforgeRoot: string): string {
  return path.join(bleepforgeRoot, ACTIVE_POINTER_FILENAME);
}

export function readRegistry(bleepforgeRoot: string): ProjectRegistry | null {
  const file = registryPath(bleepforgeRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const text = fs.readFileSync(file, "utf8");
    const parsed = ProjectRegistrySchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.warn(
        `[bleepforge/projects] malformed ${REGISTRY_FILENAME}: ${parsed.error.message}`,
      );
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn(
      `[bleepforge/projects] could not read ${file}: ${(err as Error).message}`,
    );
    return null;
  }
}

export function writeRegistry(
  bleepforgeRoot: string,
  registry: ProjectRegistry,
): void {
  writeJsonAtomic(registryPath(bleepforgeRoot), registry);
}

export function readActivePointer(
  bleepforgeRoot: string,
): ActiveProjectPointer | null {
  const file = activePointerPath(bleepforgeRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const text = fs.readFileSync(file, "utf8");
    const parsed = ActiveProjectPointerSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.warn(
        `[bleepforge/projects] malformed ${ACTIVE_POINTER_FILENAME}: ${parsed.error.message}`,
      );
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn(
      `[bleepforge/projects] could not read ${file}: ${(err as Error).message}`,
    );
    return null;
  }
}

export function writeActivePointer(
  bleepforgeRoot: string,
  pointer: ActiveProjectPointer,
): void {
  writeJsonAtomic(activePointerPath(bleepforgeRoot), pointer);
}

/** Look up a project by slug in the registry. Returns null if missing. */
export function findProject(
  registry: ProjectRegistry,
  slug: string,
): Project | null {
  return registry.projects.find((p) => p.slug === slug) ?? null;
}

/** Resolve the currently-active project record. Returns null if either
 *  the pointer is missing/empty or the slug doesn't match any project. */
export function resolveActiveProject(bleepforgeRoot: string): Project | null {
  const pointer = readActivePointer(bleepforgeRoot);
  if (!pointer || !pointer.activeSlug) return null;
  const registry = readRegistry(bleepforgeRoot);
  if (!registry) return null;
  return findProject(registry, pointer.activeSlug);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}
