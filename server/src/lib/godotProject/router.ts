// Endpoints supporting the "Godot project" section in Preferences:
//
//   GET /api/godot-project           — what root the running server is using
//                                      and where it came from (preferences vs env).
//   GET /api/godot-project/validate  — does a candidate path look like a Godot
//                                      project? Used for live input feedback.
//
// The PUT path goes through the regular /api/preferences endpoint
// (godotProjectRoot is part of the Preferences schema). Changes there don't
// take effect until the server restarts — that's surfaced in the UI as a
// "Restart required" notice. We never hot-swap config in v1.

import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../../config.js";

export const godotProjectRouter: Router = Router();

godotProjectRouter.get("/", (_req, res) => {
  res.json({
    effective: config.godotProjectRoot,
    source: config.godotProjectRootSource,
  });
});

godotProjectRouter.get("/validate", async (req, res) => {
  const raw = req.query.path;
  if (typeof raw !== "string" || !raw.trim()) {
    res.json({ ok: false, exists: false, isProject: false, message: "Empty path" });
    return;
  }
  const abs = path.resolve(raw.trim());
  let exists = false;
  let isDir = false;
  try {
    const stat = await fs.stat(abs);
    exists = true;
    isDir = stat.isDirectory();
  } catch {
    res.json({ ok: false, exists: false, isProject: false, message: "Path does not exist" });
    return;
  }
  if (!isDir) {
    res.json({ ok: false, exists, isProject: false, message: "Not a directory" });
    return;
  }
  // Look for project.godot — definitive marker for a Godot 4 project. Cheap
  // single-file stat, much faster than scanning the contents.
  let isProject = false;
  try {
    const stat = await fs.stat(path.join(abs, "project.godot"));
    isProject = stat.isFile();
  } catch {
    isProject = false;
  }
  if (!isProject) {
    res.json({
      ok: false,
      exists: true,
      isProject: false,
      message: "No project.godot — doesn't look like a Godot project",
    });
    return;
  }
  res.json({ ok: true, exists: true, isProject: true });
});
