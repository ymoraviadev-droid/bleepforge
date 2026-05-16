// HTTP surface for the multi-project layer. Endpoints:
//
//   GET    /api/projects               list every registered project + active slug
//   POST   /api/projects               create a new project (notebook or sync)
//   POST   /api/projects/import-once   seed a notebook project from a Godot tree
//   POST   /api/projects/reload        hot-reload the active project in-process
//   PATCH  /api/projects/:slug         rename displayName (slug stays immutable)
//   DELETE /api/projects/:slug         remove from registry (?wipe=true also rm -rf)
//   PUT    /api/projects/active        set the active project (slug in body)
//
// Switching or creating-with-auto-active requires a server restart —
// the active project's paths (data root, content root, godot root,
// mode) are captured once at config.ts module init and not hot-swapped.
// The relevant responses set `restartRequired: true` so the client
// wires up its restart IPC; Electron restarts the app, the server boots
// against the newly-active slug.
//
// Rename + delete are deferred to phase 8 where they have UI flows
// that justify the endpoints.

import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { ProjectModeSchema, slugify, type Project } from "@bleepforge/shared";
import { config } from "../../config.js";
import {
  findProject,
  readActivePointer,
  readRegistry,
  writeActivePointer,
  writeRegistry,
} from "./registry.js";
import { writePendingImport } from "./importOnce.js";

export const projectsRouter: Router = Router();

projectsRouter.get("/", (_req, res) => {
  const registry = readRegistry(config.bleepforgeRoot);
  const pointer = readActivePointer(config.bleepforgeRoot);
  // Two distinct "active" slugs:
  //   - activeSlug:        on-disk pointer. What the NEXT boot will load.
  //   - runtimeActiveSlug: what THIS server's config has captured. What
  //                        the rest of the API is currently serving from.
  // These desync between create/switch (which writes the pointer) and
  // the next restart (which captures it into config). The chip + the
  // /projects page surface the mismatch so the user knows when a
  // restart is pending. Pre-v0.2.5 there was only one slug because
  // there was only one project.
  res.json({
    projects: registry?.projects ?? [],
    activeSlug: pointer?.activeSlug ?? null,
    runtimeActiveSlug: config.activeProjectSlug,
    // What the running server's config has captured for the active
    // project's Godot root. Clients (useRestartRequired) compare this
    // against the registry's stored godotProjectRoot for the runtime
    // active project — when they differ, the user changed the path in
    // Preferences but the server hasn't reloaded yet.
    runtimeGodotProjectRoot: config.godotProjectRoot,
    bleepforgeRoot: config.bleepforgeRoot,
  });
});

const CreateBody = z.object({
  displayName: z.string().min(1).max(120),
  mode: ProjectModeSchema,
  /** Sync-mode only: which Godot project to couple with. Required when
   *  mode === "sync" (phase 6+), forbidden when mode === "notebook". */
  godotProjectRoot: z.string().optional(),
  /** When true (default), the new project becomes the active one and
   *  the response carries restartRequired=true so the client can wire
   *  up its restart prompt. When false, the project lands in the
   *  registry but the active pointer is unchanged. */
  setActive: z.boolean().optional(),
});

const SetActiveBody = z.object({
  slug: z.string().min(1),
});

/** Generate a slug that doesn't collide with an existing project. Bases
 *  the candidate on slugify(displayName); if taken, appends -2, -3, …
 *  until a free one is found. */
function uniqueSlug(displayName: string, existing: Project[]): string {
  const base = slugify(displayName, "untitled");
  const taken = new Set(existing.map((p) => p.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Pathological — 999 collisions on the same base name means the user
  // is doing something specifically odd. Fall back to a timestamp.
  return `${base}-${Date.now()}`;
}

projectsRouter.post("/", (req, res) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  const { displayName, mode, godotProjectRoot, setActive = true } = parsed.data;

  // Mode-specific validation of the godotProjectRoot field.
  //   - sync mode: required + must point at a real Godot project on
  //     disk (has project.godot). Captured into the project record so
  //     boot resolves contentRoot + godotProjectRoot through it.
  //   - notebook mode: forbidden — a notebook project has no Godot
  //     connection by design.
  const trimmedGodot = godotProjectRoot?.trim() ?? "";
  let resolvedGodotRoot: string | null = null;
  if (mode === "sync") {
    if (!trimmedGodot) {
      res.status(400).json({
        error: "godotProjectRoot is required for sync-mode projects",
      });
      return;
    }
    const gv = validateGodotRoot(trimmedGodot);
    if ("error" in gv) {
      res.status(400).json({ error: gv.error });
      return;
    }
    resolvedGodotRoot = gv.abs;
  } else if (trimmedGodot) {
    res.status(400).json({
      error: "godotProjectRoot is only valid for sync-mode projects",
    });
    return;
  }

  // Read or initialise the registry. A truly-fresh install (no
  // migration source, no projects/) has neither registry nor active
  // pointer; this is the bootstrap moment.
  const registry =
    readRegistry(config.bleepforgeRoot) ?? {
      schemaVersion: 1 as const,
      projects: [],
    };
  const slug = uniqueSlug(displayName, registry.projects);

  // Create the project's on-disk layout. Notebook projects own a
  // content/ dir for assets + shaders alongside the data/ dir; sync
  // projects (phase 6) will skip content/ since the Godot tree is the
  // content root.
  const projectDir = path.join(config.bleepforgeRoot, "projects", slug);
  const dataDir = path.join(projectDir, "data");
  const contentDir = path.join(projectDir, "content");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (mode === "notebook") {
      fs.mkdirSync(contentDir, { recursive: true });
    }
  } catch (err) {
    res.status(500).json({
      error: `could not create project dirs at ${projectDir}: ${(err as Error).message}`,
    });
    return;
  }

  const now = new Date().toISOString();
  const project: Project = {
    slug,
    displayName: displayName.trim(),
    mode,
    godotProjectRoot: resolvedGodotRoot,
    createdAt: now,
    lastOpened: now,
  };
  registry.projects.push(project);
  try {
    writeRegistry(config.bleepforgeRoot, registry);
  } catch (err) {
    res.status(500).json({
      error: `could not write registry: ${(err as Error).message}`,
    });
    return;
  }

  let restartRequired = false;
  if (setActive) {
    writeActivePointer(config.bleepforgeRoot, {
      schemaVersion: 1,
      activeSlug: slug,
      lastSwitched: now,
    });
    // Only flag restart when the active slug actually changed — when
    // a project is created in a state with no current active, the new
    // pointer is the first one and there's still no in-process server
    // bound to a slug, but the server's config IS captured at boot, so
    // we conservatively require a restart whenever the active changes.
    restartRequired = config.activeProjectSlug !== slug;
  }

  console.log(
    `[bleepforge/projects] created project "${displayName}" (slug=${slug}, mode=${mode})${setActive ? " + set active" : ""}`,
  );
  res.json({
    ok: true,
    project,
    activeSlug: setActive ? slug : config.activeProjectSlug,
    restartRequired,
  });
});

const ImportOnceBody = z.object({
  displayName: z.string().min(1).max(120),
  sourceGodotRoot: z.string().min(1),
});

// Validate a candidate Godot root: directory exists + contains
// project.godot. Returns the resolved absolute path or null with a
// human-readable reason. Shared between sync-mode creation and
// import-once.
function validateGodotRoot(candidate: string): { abs: string } | { error: string } {
  const abs = path.resolve(candidate.trim());
  try {
    if (!fs.statSync(abs).isDirectory()) {
      return { error: `${abs} is not a directory` };
    }
  } catch {
    return { error: `${abs} does not exist` };
  }
  try {
    if (!fs.statSync(path.join(abs, "project.godot")).isFile()) {
      return { error: `no project.godot at ${abs}` };
    }
  } catch {
    return { error: `no project.godot at ${abs}` };
  }
  return { abs };
}

// Import-once creates a notebook project seeded from a Godot tree. The
// actual heavy lifting (reconcile + asset copy + ref rewrite) runs on
// the NEXT boot: we write a manifest into the new project's data/, set
// it active, and the client restarts. At boot, app.ts detects the
// manifest, runs the seed against the source tree (now in the new
// project's path context — folderAbs already points at it), copies
// referenced files into content/, and deletes the manifest.
projectsRouter.post("/import-once", (req, res) => {
  const parsed = ImportOnceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  const { displayName, sourceGodotRoot } = parsed.data;

  const gv = validateGodotRoot(sourceGodotRoot);
  if ("error" in gv) {
    res.status(400).json({ error: gv.error });
    return;
  }

  const registry =
    readRegistry(config.bleepforgeRoot) ?? {
      schemaVersion: 1 as const,
      projects: [],
    };
  const slug = uniqueSlug(displayName, registry.projects);

  const projectDir = path.join(config.bleepforgeRoot, "projects", slug);
  const dataDir = path.join(projectDir, "data");
  const contentDir = path.join(projectDir, "content");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(contentDir, { recursive: true });
  } catch (err) {
    res.status(500).json({
      error: `could not create project dirs at ${projectDir}: ${(err as Error).message}`,
    });
    return;
  }

  const now = new Date().toISOString();
  const project: Project = {
    slug,
    displayName: displayName.trim(),
    // After the seed completes, this is a standard notebook project —
    // the import-once nature is creation-flow metadata, not a stored
    // mode. Bleepforge owns the data, no link back to the Godot tree.
    mode: "notebook",
    godotProjectRoot: null,
    createdAt: now,
    lastOpened: now,
  };
  registry.projects.push(project);
  try {
    writeRegistry(config.bleepforgeRoot, registry);
  } catch (err) {
    res.status(500).json({
      error: `could not write registry: ${(err as Error).message}`,
    });
    return;
  }

  // Stash the pending-import manifest in the new project's data/ —
  // the boot handler picks it up on next start.
  try {
    writePendingImport(dataDir, {
      schemaVersion: 1,
      sourceGodotRoot: gv.abs,
      createdAt: now,
    });
  } catch (err) {
    res.status(500).json({
      error: `could not stash pending-import manifest: ${(err as Error).message}`,
    });
    return;
  }

  // Always set active for import-once — the user just made a project
  // specifically to fork that Godot tree; staying on the current
  // project after creation would be a confusing UX dead-end.
  writeActivePointer(config.bleepforgeRoot, {
    schemaVersion: 1,
    activeSlug: slug,
    lastSwitched: now,
  });

  console.log(
    `[bleepforge/projects] queued import-once for "${displayName}" (slug=${slug}, source=${gv.abs})`,
  );
  res.json({
    ok: true,
    project,
    activeSlug: slug,
    restartRequired: true,
  });
});

const PatchBody = z.object({
  displayName: z.string().min(1).max(120),
});

projectsRouter.patch("/:slug", (req, res) => {
  const slug = req.params.slug;
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  const registry = readRegistry(config.bleepforgeRoot);
  if (!registry) {
    res.status(404).json({ error: "no project registry on disk" });
    return;
  }
  const project = findProject(registry, slug);
  if (!project) {
    res.status(404).json({ error: `no project with slug "${slug}"` });
    return;
  }
  // Slug is immutable on purpose — it's the on-disk directory name and
  // the active-pointer key. Only displayName flexes. A future "fork
  // under a new slug" is its own operation, not a rename.
  project.displayName = parsed.data.displayName.trim();
  project.lastOpened = new Date().toISOString();
  try {
    writeRegistry(config.bleepforgeRoot, registry);
  } catch (err) {
    res.status(500).json({
      error: `could not write registry: ${(err as Error).message}`,
    });
    return;
  }
  res.json({ ok: true, project });
});

projectsRouter.delete("/:slug", (req, res) => {
  const slug = req.params.slug;
  const wipe = req.query.wipe === "true" || req.query.wipe === "1";

  const registry = readRegistry(config.bleepforgeRoot);
  if (!registry) {
    res.status(404).json({ error: "no project registry on disk" });
    return;
  }
  const idx = registry.projects.findIndex((p) => p.slug === slug);
  if (idx < 0) {
    res.status(404).json({ error: `no project with slug "${slug}"` });
    return;
  }
  // Two refusals to keep the user out of a bad state:
  //   - Can't delete the active project (would point active at a slug
  //     that no longer exists; next boot limps with no project).
  //   - Can't delete the last project (registry becomes empty; same
  //     limp-mode state). The user has to create a new one first.
  if (config.activeProjectSlug === slug) {
    res.status(409).json({
      error:
        "refusing to delete the active project — switch to another project first",
    });
    return;
  }
  if (registry.projects.length <= 1) {
    res.status(409).json({
      error:
        "refusing to delete the last project — create a new one first so Bleepforge has somewhere to land",
    });
    return;
  }

  registry.projects.splice(idx, 1);
  try {
    writeRegistry(config.bleepforgeRoot, registry);
  } catch (err) {
    res.status(500).json({
      error: `could not write registry: ${(err as Error).message}`,
    });
    return;
  }

  let wiped = false;
  if (wipe) {
    const projectDir = path.join(config.bleepforgeRoot, "projects", slug);
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
      wiped = true;
    } catch (err) {
      // Registry write already succeeded — the project is gone from
      // Bleepforge's POV even if the on-disk wipe failed. Surface the
      // partial-success state so the client can warn the user.
      console.error(
        `[bleepforge/projects] wipe failed for ${projectDir}: ${(err as Error).message}`,
      );
      res.json({
        ok: true,
        slug,
        wiped: false,
        wipeError: (err as Error).message,
      });
      return;
    }
  }

  // Sync-mode projects are deliberately forget-only as far as the Godot
  // tree is concerned: we never touch the user's Godot project on
  // disk, even when wipe=true. The wipe scope is strictly
  // projects/<slug>/ (Bleepforge's data + content). The Godot tree
  // stays where it is and can be re-imported into a new project later.

  console.log(
    `[bleepforge/projects] removed project "${slug}" (wipe=${wiped})`,
  );
  res.json({ ok: true, slug, wiped });
});

projectsRouter.put("/active", (req, res) => {
  const parsed = SetActiveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  const { slug } = parsed.data;
  const registry = readRegistry(config.bleepforgeRoot);
  if (!registry) {
    res.status(404).json({ error: "no project registry on disk" });
    return;
  }
  const target = findProject(registry, slug);
  if (!target) {
    res.status(404).json({ error: `no project with slug "${slug}"` });
    return;
  }
  const now = new Date().toISOString();
  writeActivePointer(config.bleepforgeRoot, {
    schemaVersion: 1,
    activeSlug: slug,
    lastSwitched: now,
  });
  // No-op when slug matches the currently-running active project — a
  // restart would still pick up the same project, but it's pointless work
  // for the user. Flag it so the client can skip the restart prompt.
  const noop = config.activeProjectSlug === slug;
  res.json({
    ok: true,
    activeSlug: slug,
    restartRequired: !noop,
    noop,
  });
});
