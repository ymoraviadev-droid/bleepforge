// Legacy data/ → projects/<slug>/data/ migration + cross-machine bootstrap.
// Runs once at server boot when there's no projects.json yet. Two distinct
// paths, both populate the registry; whichever fits the disk state runs:
//
//   1. MIGRATION — legacy data/ has content (pre-v0.2.6 install upgrading):
//      a. Derive slug from data/concept.json's Title.
//      b. Pull godotProjectRoot from data/preferences.json into the record.
//      c. Move every entry from data/ to projects/<slug>/data/ via rename
//         (atomic same-mount; cross-mount falls back to recursive copy).
//      d. Write registry + active-project pointer.
//      Partial-migration recovery: if projects/<slug>/data/ already exists
//      from an interrupted run, MERGE — move only entries missing from
//      target, never overwrite. Conflicts are logged for manual resolution.
//      The legacy data/ dir is intentionally NOT removed — left empty as a
//      verification window for the user.
//
//   2. BOOTSTRAP — projects/ tree exists but no registry (cross-machine
//      clone of a repo that was committed post-migration on another box):
//      a. Walk projects/<slug>/data/ dirs, derive each one's slug from
//         the directory name + displayName from concept.json (fallback to
//         the slug if missing).
//      b. godotProjectRoot defaults to null (machine-specific, not
//         committable) → user sets it via Preferences then restarts.
//      c. Write registry pointing at every discovered project; active
//         pointer picks the first.
//
// Both paths converge on the same end state: a registry that the rest of
// the server can read through.

import fs from "node:fs";
import path from "node:path";
import { slugify, type Project, type ProjectRegistry } from "@bleepforge/shared";
import {
  readRegistry,
  writeActivePointer,
  writeRegistry,
} from "./registry.js";

const PROJECTS_DIRNAME = "projects";
const LEGACY_FALLBACK_SLUG = "flock-of-bleeps";

export interface MigrationResult {
  ran: boolean;
  kind?: "migrate" | "bootstrap";
  /** Reason for skipping, when ran=false. */
  reason?: string;
  /** When ran=true. */
  slug?: string;
  displayName?: string;
  movedEntries?: number;
  conflictedEntries?: string[];
  godotProjectRoot?: string | null;
  /** When kind="bootstrap": the slugs of every discovered project. */
  bootstrappedSlugs?: string[];
}

/** Returns true when there's a registry already → nothing to migrate. */
function alreadyMigrated(bleepforgeRoot: string): boolean {
  return readRegistry(bleepforgeRoot) !== null;
}

/** Returns true when the legacy data dir exists and has at least one
 *  non-dotfile entry worth migrating. */
function hasLegacyData(legacyDataRoot: string): boolean {
  if (!fs.existsSync(legacyDataRoot)) return false;
  const entries = fs.readdirSync(legacyDataRoot).filter((e) => !e.startsWith("."));
  return entries.length > 0;
}

/** Read concept.json's Title for slug derivation. Tolerant of malformed
 *  JSON / missing file / missing field — falls through to the fallback. */
function readConceptTitle(legacyDataRoot: string): string | null {
  const file = path.join(legacyDataRoot, "concept.json");
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const title = parsed?.Title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

/** Read preferences.json's godotProjectRoot for one-time pull-out into the
 *  new project record. Tolerant of malformed/missing — returns null. */
function readLegacyGodotRoot(legacyDataRoot: string): string | null {
  const file = path.join(legacyDataRoot, "preferences.json");
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const root = parsed?.godotProjectRoot;
    if (typeof root === "string" && root.trim()) {
      return path.resolve(root.trim());
    }
  } catch {
    // ignore
  }
  return null;
}

/** Move a directory entry from source to target. Uses rename for atomic
 *  same-mount moves; falls back to recursive copy + remove for cross-mount
 *  (unlikely for the Bleepforge layout but harmless). */
function moveEntry(srcPath: string, dstPath: string): void {
  try {
    fs.renameSync(srcPath, dstPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") throw err;
    // Cross-mount: copy then remove.
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
      fs.rmSync(srcPath, { recursive: true });
    } else {
      fs.copyFileSync(srcPath, dstPath);
      fs.unlinkSync(srcPath);
    }
  }
}

function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

/** Bootstrap: registry doesn't exist but projects/<slug>/data/ dirs do.
 *  Happens after cross-machine clone of a repo that's already been
 *  migrated on another machine. Registers every discovered project with
 *  godotProjectRoot=null (machine-specific; user sets via Preferences). */
function bootstrapFromProjectsTree(bleepforgeRoot: string): MigrationResult {
  const projectsDir = path.join(bleepforgeRoot, PROJECTS_DIRNAME);
  if (!fs.existsSync(projectsDir)) {
    return { ran: false, reason: "no-projects-tree" };
  }
  const discovered: Project[] = [];
  const now = new Date().toISOString();
  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    const dataDir = path.join(projectsDir, slug, "data");
    if (!fs.existsSync(dataDir)) continue;
    const title = readConceptTitle(dataDir);
    const displayName = title ?? slug;
    const godotProjectRoot = readLegacyGodotRoot(dataDir);
    discovered.push({
      slug,
      displayName,
      mode: "sync",
      godotProjectRoot,
      createdAt: now,
      lastOpened: now,
    });
  }
  if (discovered.length === 0) {
    return { ran: false, reason: "no-projects-found" };
  }
  // Stable order: alphabetical by slug. Active pointer goes to the first.
  discovered.sort((a, b) => a.slug.localeCompare(b.slug));
  const first = discovered[0]!;
  writeRegistry(bleepforgeRoot, {
    schemaVersion: 1,
    projects: discovered,
  });
  writeActivePointer(bleepforgeRoot, {
    schemaVersion: 1,
    activeSlug: first.slug,
    lastSwitched: now,
  });
  return {
    ran: true,
    kind: "bootstrap",
    slug: first.slug,
    displayName: first.displayName,
    godotProjectRoot: first.godotProjectRoot,
    bootstrappedSlugs: discovered.map((p) => p.slug),
  };
}

export function runLegacyMigration(
  bleepforgeRoot: string,
  legacyDataRoot: string,
): MigrationResult {
  if (alreadyMigrated(bleepforgeRoot)) {
    return { ran: false, reason: "already-migrated" };
  }
  if (!hasLegacyData(legacyDataRoot)) {
    // No legacy data — fall back to bootstrap path, which handles the
    // cross-machine clone case. Returns its own no-op result if neither
    // legacy nor bootstrap inputs exist (truly-fresh install).
    return bootstrapFromProjectsTree(bleepforgeRoot);
  }

  const title = readConceptTitle(legacyDataRoot);
  const displayName = title ?? "Flock of Bleeps";
  const slug = title ? slugify(title, LEGACY_FALLBACK_SLUG) : LEGACY_FALLBACK_SLUG;
  const godotProjectRoot = readLegacyGodotRoot(legacyDataRoot);

  const targetDataRoot = path.join(bleepforgeRoot, PROJECTS_DIRNAME, slug, "data");
  fs.mkdirSync(targetDataRoot, { recursive: true });

  const conflictedEntries: string[] = [];
  let moved = 0;
  for (const entry of fs.readdirSync(legacyDataRoot)) {
    if (entry.startsWith(".")) continue;
    const src = path.join(legacyDataRoot, entry);
    const dst = path.join(targetDataRoot, entry);
    if (fs.existsSync(dst)) {
      // Resumed-migration case: target already populated. Leave both in
      // place rather than overwrite — the user gets a warning to resolve.
      conflictedEntries.push(entry);
      continue;
    }
    moveEntry(src, dst);
    moved++;
  }

  // Build the registry record + active-project pointer.
  const now = new Date().toISOString();
  const project: Project = {
    slug,
    displayName,
    mode: "sync",
    godotProjectRoot,
    createdAt: now,
    lastOpened: now,
  };
  const registry: ProjectRegistry = { schemaVersion: 1, projects: [project] };
  writeRegistry(bleepforgeRoot, registry);
  writeActivePointer(bleepforgeRoot, {
    schemaVersion: 1,
    activeSlug: slug,
    lastSwitched: now,
  });

  return {
    ran: true,
    kind: "migrate",
    slug,
    displayName,
    movedEntries: moved,
    conflictedEntries,
    godotProjectRoot,
  };
}
