// HTTP surface for the multi-project layer. Endpoints:
//
//   GET  /api/projects           list every registered project + active slug
//   PUT  /api/projects/active    set the active project (slug in body)
//
// Switching projects requires a server restart — the active project's
// paths (data root, content root, godot root, mode) are captured once
// at config.ts module init and not hot-swapped. The PUT returns 200
// with `restartRequired: true` so the client can wire up its restart
// IPC; the Electron main process restarts the app and the server boots
// against the newly-active slug.
//
// Project creation, rename, and delete are deferred to phases 5–8 where
// they have UI flows that justify the endpoints.

import { Router } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import {
  findProject,
  readActivePointer,
  readRegistry,
  writeActivePointer,
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

const SetActiveBody = z.object({
  slug: z.string().min(1),
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
