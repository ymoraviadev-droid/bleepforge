// HTTP surface for the multi-project layer. Endpoints:
//
//   GET  /api/projects           list every registered project + active slug
//   POST /api/projects           create a new project (notebook in phase 5;
//                                sync mode added in phase 6)
//   PUT  /api/projects/active    set the active project (slug in body)
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

export const projectsRouter: Router = Router();

projectsRouter.get("/", (_req, res) => {
  const registry = readRegistry(config.bleepforgeRoot);
  const pointer = readActivePointer(config.bleepforgeRoot);
  res.json({
    projects: registry?.projects ?? [],
    activeSlug: pointer?.activeSlug ?? null,
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

  if (mode === "sync") {
    res.status(501).json({
      error:
        "Sync-mode creation lands in v0.2.6 phase 6 — use mode=\"notebook\" for now",
    });
    return;
  }
  if (godotProjectRoot && godotProjectRoot.trim()) {
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
