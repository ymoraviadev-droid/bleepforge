// HTTP surface for the shader gallery. Endpoints (Phase 1 — read-only):
//
//   GET /api/shaders              list every discovered .gdshader file
//   GET /api/shaders/file?path=…  full source + descriptor for one shader
//   GET /api/shaders/usages?path=…  reverse-lookup references for one shader
//   GET /api/shaders/usage-counts  per-shader "used by N" map for the list page
//
// Phase 2 will add POST /import (create), PUT /file (save), DELETE /file
// (delete), and GET /events (SSE). Phase 1 is intentionally read-only —
// validates the storage model + the cross-system reference search before
// we add writeback.
//
// No in-memory cache yet: Phase 1 re-discovers on every list call. The
// corpus is tiny (single-digit shaders) so the walk + parse runs in well
// under 10ms; caching earns its keep once the watcher and SSE land in
// Phase 2 (we'll want a single source of truth that delta updates push
// into).

import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";

import { config } from "../../config.js";
import { discoverShaders, summarizeShader } from "./discover.js";
import { countAllShaderUsages, findShaderUsages } from "./usages.js";
import type { ShaderAsset } from "./types.js";

export const shadersRouter: Router = Router();

shadersRouter.get("/", async (_req, res) => {
  if (!config.godotProjectRoot) {
    res.json({ shaders: [] });
    return;
  }
  try {
    const shaders = await discoverShaders(config.godotProjectRoot);
    // Stable order by parentRel then basename, so the list page renders
    // the same way across reloads. The list page sorts again client-side,
    // but starting from a deterministic order makes diffs / debugging
    // easier.
    shaders.sort(
      (a, b) =>
        a.parentRel.localeCompare(b.parentRel) ||
        a.basename.localeCompare(b.basename),
    );
    res.json({ shaders });
  } catch (err) {
    res
      .status(500)
      .json({ error: `discover failed: ${(err as Error).message}` });
  }
});

shadersRouter.get("/file", async (req, res) => {
  if (!config.godotProjectRoot) {
    res.status(503).json({ error: "godotProjectRoot not configured" });
    return;
  }
  const requested = String(req.query.path ?? "");
  if (!requested) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const resolved = path.resolve(requested);
  const rel = path.relative(config.godotProjectRoot, resolved);
  // Defense in depth — refuse paths outside the Godot project root. Same
  // pattern every other file-touching endpoint uses.
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res
      .status(403)
      .json({ error: "path must be inside the Godot project root" });
    return;
  }
  if (!resolved.endsWith(".gdshader")) {
    res.status(400).json({ error: "path must be a .gdshader file" });
    return;
  }
  let source: string;
  try {
    source = await fs.readFile(resolved, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      res.status(404).json({ error: `file does not exist: ${resolved}` });
      return;
    }
    res.status(500).json({ error: `read failed: ${(err as Error).message}` });
    return;
  }
  const asset = await summarizeShader(resolved, config.godotProjectRoot);
  res.json({ asset, source });
});

shadersRouter.get("/usages", async (req, res) => {
  if (!config.godotProjectRoot) {
    res.status(503).json({ error: "godotProjectRoot not configured" });
    return;
  }
  const requested = String(req.query.path ?? "");
  if (!requested) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const resolved = path.resolve(requested);
  const asset = await summarizeShader(resolved, config.godotProjectRoot);
  if (!asset) {
    // Fall back to a synthetic descriptor so the request still completes
    // for a path we couldn't summarize (file gone, malformed, etc.).
    // UID-based matches fail in that case — only path-based matches fire.
    const fallback: ShaderAsset = {
      path: resolved,
      basename: path.basename(resolved),
      parentDir: path.dirname(resolved),
      parentRel: "",
      uid: null,
      shaderType: null,
      uniformCount: 0,
      sizeBytes: 0,
      mtimeMs: 0,
    };
    const usages = await findShaderUsages(fallback);
    res.json({ asset: null, usages });
    return;
  }
  const usages = await findShaderUsages(asset);
  res.json({ asset, usages });
});

shadersRouter.get("/usage-counts", async (_req, res) => {
  if (!config.godotProjectRoot) {
    res.json({ counts: {} });
    return;
  }
  try {
    const shaders = await discoverShaders(config.godotProjectRoot);
    const counts = await countAllShaderUsages(
      shaders.map((s) => ({ path: s.path, uid: s.uid })),
    );
    res.json({ counts });
  } catch (err) {
    res
      .status(500)
      .json({ error: `usage-counts failed: ${(err as Error).message}` });
  }
});
