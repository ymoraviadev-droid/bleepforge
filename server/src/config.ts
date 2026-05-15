import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectMode } from "@bleepforge/shared";
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
// v0.2.6 canonical source). Sync-mode projects carry the path on their
// record; the env var is the bootstrap fallback for first-boot scenarios
// where no project exists yet (limp mode → user sets path via Preferences).
// Notebook projects intentionally IGNORE the env var — they have no Godot
// connection by design, and falling through to env would point the watcher
// + asset router at the wrong tree.
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
  if (activeProject && activeProject.mode === "notebook") {
    // Notebook projects own their content — no Godot tree to fall back
    // to. Returning null here makes the env-var bootstrap skip.
    return { path: null, source: null };
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

// contentRoot: where the active project's raw asset + shader files live.
//   - sync mode: the Godot project tree itself (assets + shaders live
//     alongside .tres files there).
//   - notebook mode: the project's own content/ dir under projects/<slug>/.
//   - no active project: null (limp mode).
const contentRoot: string | null = (() => {
  if (!activeProject) return null;
  if (activeProject.mode === "notebook") {
    return path.join(bleepforgeRoot, "projects", activeProject.slug, "content");
  }
  return resolved.path;
})();

export const config = {
  /** Where projects.json, active-project.json, and projects/ live. */
  bleepforgeRoot,
  /** Slug of the currently-active project, or null when none exists. */
  activeProjectSlug: activeProject?.slug ?? null,
  /** Active project's mode (sync = .tres-coupled, notebook = standalone).
   *  Null when no project is active. Captured once at boot — switching
   *  modes requires a server restart, by design. */
  projectMode: (activeProject?.mode ?? null) as ProjectMode | null,
  /** Active project's data dir. Falls back to legacy data/ when no
   *  project is active (limp mode). */
  dataRoot,
  assetRoot,
  /** Where the active project's raw asset + shader files live —
   *  anchor for the image gallery, shader gallery, AssetPicker browse,
   *  and any path-safety check on user-authored file writes.
   *
   *  Sync mode: equals godotProjectRoot (the Godot project tree IS the
   *  content root — assets and shaders live among the .tres files).
   *
   *  Notebook mode (phase 5+): the project's own content/ dir, decoupled
   *  from any Godot tree. Phase 2 introduces this alias; phase 5 makes
   *  it diverge from godotProjectRoot.
   *
   *  Null when no project is configured (truly-fresh install, limp mode). */
  contentRoot,
  godotProjectRoot: resolved.path,
  godotProjectRootSource: resolved.source,
  port: Number(process.env.PORT ?? 4000),
};

/** Sync mode = active project is .tres-coupled (today's only mode pre-v0.2.6).
 *  Gate any .tres / Godot-tree-anchored feature on this. */
export function isSyncMode(): boolean {
  return config.projectMode === "sync";
}

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
