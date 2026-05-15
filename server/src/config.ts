import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveActiveProject } from "./lib/projects/registry.js";
import { runLegacyMigration } from "./lib/projects/migrate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dialogeurRoot = path.resolve(here, "..", "..");

// The legacy single-project data root. Pre-v0.2.6, this was THE data root.
// Post-v0.2.6, it's only the migration source: on first boot of v0.2.6+
// against a v0.2.5-or-earlier install, we move its contents into
// projects/<slug>/data/. After that the directory remains (empty) until
// the user removes it manually — see runLegacyMigration for rationale.
const legacyDataRoot = path.resolve(
  dialogeurRoot,
  process.env.DATA_ROOT ?? "data",
);

// The Bleepforge install root — the directory that holds projects.json,
// active-project.json, and the projects/ subtree. In dev that's
// dialoguer/; in packaged mode it's <userData> (~/.config/Bleepforge).
// Parent-of-legacy-data-root works for both layouts.
const bleepforgeRoot = path.dirname(legacyDataRoot);

// One-shot migration. No-op once the registry exists.
const migration = runLegacyMigration(bleepforgeRoot, legacyDataRoot);
if (migration.ran) {
  console.log(
    `[bleepforge/projects] migrated legacy data/ → projects/${migration.slug}/data/`,
  );
  console.log(
    `[bleepforge/projects]   display name: "${migration.displayName}"`,
  );
  console.log(
    `[bleepforge/projects]   moved ${migration.movedEntries ?? 0} entries`,
  );
  if (migration.conflictedEntries && migration.conflictedEntries.length > 0) {
    console.warn(
      `[bleepforge/projects]   conflicts (left in place, resolve manually): ${migration.conflictedEntries.join(", ")}`,
    );
  }
  if (migration.godotProjectRoot) {
    console.log(
      `[bleepforge/projects]   godot project root: ${migration.godotProjectRoot}`,
    );
  }
  console.log(
    `[bleepforge/projects]   the legacy data/ dir is left empty as a verification window — remove it manually after confirming the migration`,
  );
}

const activeProject = resolveActiveProject(bleepforgeRoot);

// dataRoot: from the active project when available, else fall back to the
// legacy path. The fallback case covers truly-fresh installs where no
// migration ran (no legacy data, no projects yet) — the server limp-modes
// just like pre-v0.2.6 boots with no Godot root.
const dataRoot = activeProject
  ? path.join(bleepforgeRoot, "projects", activeProject.slug, "data")
  : legacyDataRoot;

const assetRoot = path.resolve(process.env.ASSET_ROOT ?? os.homedir());

// Resolve the Godot project root from the active project record (post-
// v0.2.6 canonical source). Fall back to the env var for first-boot
// scenarios where no project exists yet. Changes to the active project's
// godotProjectRoot still require a server restart — the value is captured
// once here at module init and never mutated in-process.
function resolveGodotRoot(): {
  path: string | null;
  source: "project" | "env" | null;
} {
  if (activeProject && activeProject.godotProjectRoot) {
    return {
      path: path.resolve(activeProject.godotProjectRoot),
      source: "project",
    };
  }
  if (process.env.GODOT_PROJECT_ROOT) {
    return {
      path: path.resolve(process.env.GODOT_PROJECT_ROOT),
      source: "env",
    };
  }
  return { path: null, source: null };
}

const resolved = resolveGodotRoot();

export const config = {
  /** Where projects.json, active-project.json, and projects/ live. */
  bleepforgeRoot,
  /** Slug of the currently-active project, or null when none exists. */
  activeProjectSlug: activeProject?.slug ?? null,
  /** Active project's data dir. Falls back to legacy data/ when no
   *  project is active (limp mode). */
  dataRoot,
  assetRoot,
  godotProjectRoot: resolved.path,
  godotProjectRootSource: resolved.source,
  port: Number(process.env.PORT ?? 4000),
};

export const folderAbs = {
  dialog: path.join(dataRoot, "dialogs"),
  quest: path.join(dataRoot, "quests"),
  item: path.join(dataRoot, "items"),
  karma: path.join(dataRoot, "karma"),
  npc: path.join(dataRoot, "npcs"),
  faction: path.join(dataRoot, "factions"),
  balloon: path.join(dataRoot, "balloons"),
  codex: path.join(dataRoot, "codex"),
  help: path.join(dataRoot, "help"),
  shader: path.join(dataRoot, "shaders"),
};
