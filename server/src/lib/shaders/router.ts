// HTTP surface for the shader gallery. Endpoints:
//
//   GET    /api/shaders              list every discovered .gdshader file
//   GET    /api/shaders/file?path=…  full source + descriptor for one shader
//   PUT    /api/shaders/file         save source back to disk (Phase 2)
//   POST   /api/shaders/new          create a new .gdshader from a template (Phase 2)
//   DELETE /api/shaders/file?path=…  remove file + .gdshader.uid sidecar (Phase 2)
//   GET    /api/shaders/usages?path=…  reverse-lookup references for one shader
//   GET    /api/shaders/usage-counts  per-shader "used by N" map for the list page
//   GET    /api/shaders/events       SSE stream of add/change/remove (Phase 2)
//
// Phase 1 was read-only (the four GETs above except /events). Phase 2
// added authoring: write endpoints, watcher integration, the SSE
// channel, and the in-memory cache that backs all three of them.
//
// No self-write suppression: the watcher upserts the cache + publishes
// SSE on every .gdshader change regardless of who wrote it. That keeps
// other open windows in sync (a save in window A shows up in window B's
// list). The saving window's edit page suppresses the "external change"
// banner against its own save via a dirty check in useShaderRefresh's
// callback, not by hiding the event.

import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";

import {
  ShaderCardColorSchema,
  ShaderPatternSchema,
  type ShaderCardColor,
  type ShaderPattern,
} from "@bleepforge/shared";
import { config } from "../../config.js";
import { recordSave } from "../saves/buffer.js";
import { listShaders, rebuildShaderCache, upsertShader } from "./cache.js";
import { discoverShaders, summarizeShader } from "./discover.js";
import { subscribeShaderEvents, publishShaderEvent } from "./eventBus.js";
import {
  randomShaderPattern,
  removeShaderMeta,
  setShaderColor,
  setShaderPattern,
} from "./meta.js";
import { noteShaderSelfWrite, shaderSaveKey } from "./selfWrite.js";
import { countAllShaderUsages, findShaderUsages } from "./usages.js";
import type { ShaderAsset } from "./types.js";

export const shadersRouter: Router = Router();

shadersRouter.get("/", async (_req, res) => {
  if (!config.contentRoot) {
    res.json({ shaders: [] });
    return;
  }
  try {
    // Prefer the in-memory cache; fall back to a fresh walk if the cache
    // hasn't been built yet (e.g. boot reconcile is still running). The
    // fall-through keeps the endpoint useful during the boot window.
    let shaders = listShaders();
    if (shaders.length === 0) {
      shaders = await discoverShaders(config.contentRoot);
    }
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
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const requested = String(req.query.path ?? "");
  if (!requested) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const resolved = path.resolve(requested);
  const rel = path.relative(config.contentRoot, resolved);
  // Defense in depth — refuse paths outside the content root. Same
  // pattern every other file-touching endpoint uses.
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res
      .status(403)
      .json({ error: "path must be inside the project content root" });
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
  const asset = await summarizeShader(resolved, config.contentRoot);
  res.json({ asset, source });
});

shadersRouter.get("/usages", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const requested = String(req.query.path ?? "");
  if (!requested) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const resolved = path.resolve(requested);
  const asset = await summarizeShader(resolved, config.contentRoot);
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
      pattern: null,
      color: null,
    };
    const usages = await findShaderUsages(fallback);
    res.json({ asset: null, usages });
    return;
  }
  const usages = await findShaderUsages(asset);
  res.json({ asset, usages });
});

shadersRouter.get("/usage-counts", async (_req, res) => {
  if (!config.contentRoot) {
    res.json({ counts: {} });
    return;
  }
  try {
    // Same cache-first / walk-fallback pattern as the list endpoint.
    let shaders = listShaders();
    if (shaders.length === 0) {
      shaders = await discoverShaders(config.contentRoot);
    }
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

// SSE stream of shader add/change/remove events. The renderer keeps one
// EventSource open per browser origin; popouts use a same-origin
// BroadcastChannel relay rather than each opening their own (would
// otherwise hit the 6-per-origin HTTP connection cap, same fix the
// asset / sync / saves streams use).
shadersRouter.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25_000);

  const unsubscribe = subscribeShaderEvents((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });

  res.write(": connected\n\n");
});

interface SaveBody {
  /** Absolute filesystem path to the .gdshader being saved. Must be inside
   *  the content root and end in .gdshader. */
  path: string;
  /** New source text. Stored verbatim — no syntax validation server-side;
   *  Godot reports compile errors when it reloads the shader. */
  source: string;
}

// Atomic save. Self-write is recorded BEFORE the rename so the watcher's
// debounce window sees us first when the rename's add event fires. Returns
// the fresh descriptor so the client can update its local copy without a
// round-trip GET.
shadersRouter.put("/file", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const body = req.body as Partial<SaveBody> | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "JSON body required" });
    return;
  }
  const requested = typeof body.path === "string" ? body.path : "";
  const source = typeof body.source === "string" ? body.source : "";
  if (!requested) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  const resolved = path.resolve(requested);
  const rel = path.relative(config.contentRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res
      .status(403)
      .json({ error: "path must be inside the project content root" });
    return;
  }
  if (!resolved.endsWith(".gdshader")) {
    res.status(400).json({ error: "path must be a .gdshader file" });
    return;
  }
  try {
    await fs.access(resolved);
  } catch {
    res
      .status(404)
      .json({ error: `file does not exist: ${resolved} — use POST /new for new shaders` });
    return;
  }

  const tmpPath = `${resolved}.tmp.${process.pid}.${Date.now()}`;
  // Mark self-write BEFORE the rename so the watcher's debounce window
  // sees us first when the rename's change event fires.
  noteShaderSelfWrite(resolved);
  try {
    await fs.writeFile(tmpPath, source, "utf8");
    await fs.rename(tmpPath, resolved);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore — temp may not exist if rename failed before it landed
    }
    recordSave({
      ts: new Date().toISOString(),
      direction: "outgoing",
      domain: "shader",
      key: shaderSaveKey(resolved),
      action: "updated",
      outcome: "error",
      path: resolved,
      error: (err as Error).message,
    });
    res
      .status(500)
      .json({ error: `write failed: ${(err as Error).message}` });
    return;
  }

  const asset = await summarizeShader(resolved, config.contentRoot);
  recordSave({
    ts: new Date().toISOString(),
    direction: "outgoing",
    domain: "shader",
    key: shaderSaveKey(resolved),
    action: "updated",
    outcome: "ok",
    path: resolved,
  });
  console.log(`[shaders/save] wrote ${source.length} bytes → ${resolved}`);
  res.json({ ok: true, asset });
});

interface NewBody {
  /** Target directory (absolute or content-root-relative). Must be inside
   *  the content root. */
  targetDir: string;
  /** Filename — basename only. `.gdshader` extension is appended if
   *  missing so the user doesn't have to type it. */
  filename: string;
  /** Initial shader_type — defaults to canvas_item, the only type the
   *  Phase 3 translator will support. Stored in the template's first
   *  line; user can change it afterwards. */
  shaderType?: "canvas_item" | "spatial" | "particles" | "sky" | "fog";
}

const NEW_SHADER_TEMPLATES: Record<NonNullable<NewBody["shaderType"]>, string> = {
  canvas_item: `shader_type canvas_item;\n\nvoid fragment() {\n    COLOR = texture(TEXTURE, UV);\n}\n`,
  spatial: `shader_type spatial;\n\nvoid fragment() {\n    ALBEDO = vec3(1.0);\n}\n`,
  particles: `shader_type particles;\n\nvoid process() {\n    \n}\n`,
  sky: `shader_type sky;\n\nvoid sky() {\n    COLOR = vec3(0.0, 0.0, 0.05);\n}\n`,
  fog: `shader_type fog;\n\nvoid fog() {\n    DENSITY = 0.1;\n}\n`,
};

shadersRouter.post("/new", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const body = req.body as Partial<NewBody> | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "JSON body required" });
    return;
  }
  const targetDir = typeof body.targetDir === "string" ? body.targetDir : "";
  let filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const shaderType = body.shaderType ?? "canvas_item";
  if (!targetDir || !filename) {
    res.status(400).json({ error: "targetDir and filename are required" });
    return;
  }
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    res.status(400).json({ error: "filename must be a basename (no slashes)" });
    return;
  }
  if (!filename.endsWith(".gdshader")) filename = `${filename}.gdshader`;
  if (!NEW_SHADER_TEMPLATES[shaderType]) {
    res.status(400).json({ error: `unsupported shaderType: ${shaderType}` });
    return;
  }
  const resolvedDir = path.resolve(config.contentRoot, targetDir);
  const relDir = path.relative(config.contentRoot, resolvedDir);
  if (relDir.startsWith("..") || path.isAbsolute(relDir)) {
    res
      .status(403)
      .json({ error: "targetDir must be inside the project content root" });
    return;
  }
  let stat;
  try {
    stat = await fs.stat(resolvedDir);
  } catch {
    res.status(404).json({ error: `targetDir does not exist: ${resolvedDir}` });
    return;
  }
  if (!stat.isDirectory()) {
    res.status(400).json({ error: `targetDir is not a directory` });
    return;
  }
  const targetPath = path.join(resolvedDir, filename);
  try {
    await fs.access(targetPath);
    res.status(409).json({
      error: `file already exists: ${targetPath}`,
      existingPath: targetPath,
    });
    return;
  } catch {
    // ENOENT — good, proceed.
  }

  const template = NEW_SHADER_TEMPLATES[shaderType];
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  noteShaderSelfWrite(targetPath);
  try {
    await fs.writeFile(tmpPath, template, "utf8");
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    recordSave({
      ts: new Date().toISOString(),
      direction: "outgoing",
      domain: "shader",
      key: shaderSaveKey(targetPath),
      action: "updated",
      outcome: "error",
      path: targetPath,
      error: (err as Error).message,
    });
    res
      .status(500)
      .json({ error: `write failed: ${(err as Error).message}` });
    return;
  }

  // Assign a random card pattern so new shaders are visually distinguishable
  // from each other out of the box — user can override via the picker in
  // Edit. Persisted to data/shaders/_meta.json keyed by project-relative
  // path; summarizeShader picks it up automatically.
  const newPattern = randomShaderPattern();
  const relPath = path.relative(config.contentRoot, targetPath);
  setShaderPattern(relPath, newPattern);

  const asset = await summarizeShader(targetPath, config.contentRoot);
  recordSave({
    ts: new Date().toISOString(),
    direction: "outgoing",
    domain: "shader",
    key: shaderSaveKey(targetPath),
    action: "updated",
    outcome: "ok",
    path: targetPath,
  });
  console.log(`[shaders/new] created ${targetPath} (${shaderType}, pattern=${newPattern})`);
  res.json({ ok: true, path: targetPath, asset, source: template });
});

// PUT /api/shaders/meta — update the user-picked card pattern and/or
// color for one shader. Body: { path: <absolute>, pattern?: ShaderPattern,
// color?: ShaderCardColor | null }. At least one of pattern/color must be
// supplied; passing color: null clears the override (card falls back to
// the shader_type tint). Triggers a cache upsert + ShaderEvent so other
// open windows refresh.
shadersRouter.put("/meta", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const body = req.body as
    | { path?: unknown; pattern?: unknown; color?: unknown }
    | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "JSON body required" });
    return;
  }
  if (typeof body.path !== "string") {
    res.status(400).json({ error: "path (absolute) is required" });
    return;
  }
  // pattern is optional but, when present, must be a valid enum value.
  let pattern: ShaderPattern | undefined;
  if (body.pattern !== undefined) {
    const parsed = ShaderPatternSchema.safeParse(body.pattern);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: `invalid pattern: ${parsed.error.message}` });
      return;
    }
    pattern = parsed.data;
  }
  // color is optional; explicit null clears the override. Anything else
  // must be one of the palette enum values.
  let color: ShaderCardColor | null | undefined;
  if (body.color !== undefined) {
    if (body.color === null) {
      color = null;
    } else {
      const parsed = ShaderCardColorSchema.safeParse(body.color);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: `invalid color: ${parsed.error.message}` });
        return;
      }
      color = parsed.data;
    }
  }
  if (pattern === undefined && color === undefined) {
    res
      .status(400)
      .json({ error: "at least one of pattern or color must be supplied" });
    return;
  }
  const resolved = path.resolve(body.path);
  const rel = path.relative(config.contentRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.status(403).json({ error: "path must be inside the project content root" });
    return;
  }
  if (pattern !== undefined) setShaderPattern(rel, pattern);
  if (color !== undefined) setShaderColor(rel, color);
  // Refresh the in-memory descriptor + tell other windows.
  const updated = await upsertShader(resolved);
  publishShaderEvent({ kind: "changed", path: resolved });
  res.json({ ok: true, asset: updated });
});

shadersRouter.delete("/file", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const requested = String(req.query.path ?? "");
  if (!requested) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const resolved = path.resolve(requested);
  const rel = path.relative(config.contentRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res
      .status(403)
      .json({ error: "path must be inside the project content root" });
    return;
  }
  if (!resolved.endsWith(".gdshader")) {
    res.status(400).json({ error: "path must be a .gdshader file" });
    return;
  }
  const removed: string[] = [];
  noteShaderSelfWrite(resolved);
  try {
    await fs.unlink(resolved);
    removed.push(resolved);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      res.status(404).json({ error: `file does not exist: ${resolved}` });
      return;
    }
    recordSave({
      ts: new Date().toISOString(),
      direction: "outgoing",
      domain: "shader",
      key: shaderSaveKey(resolved),
      action: "deleted",
      outcome: "error",
      path: resolved,
      error: (err as Error).message,
    });
    res
      .status(500)
      .json({ error: `delete failed: ${(err as Error).message}` });
    return;
  }
  // Drop the Bleepforge-only meta entry (card pattern) so a fresh
  // shader at the same path doesn't inherit the dead one's pattern.
  removeShaderMeta(rel);
  // Best-effort sidecar removal. `.gdshader` → `.gdshader.uid`. If the
  // sidecar isn't there (shader was just created by Bleepforge before
  // Godot processed it), that's fine — we don't error.
  const sidecarPath = `${resolved}.uid`;
  try {
    await fs.unlink(sidecarPath);
    removed.push(sidecarPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(
        `[shaders/delete] sidecar removal failed for ${sidecarPath}: ${(err as Error).message}`,
      );
    }
  }
  recordSave({
    ts: new Date().toISOString(),
    direction: "outgoing",
    domain: "shader",
    key: shaderSaveKey(resolved),
    action: "deleted",
    outcome: "ok",
    path: resolved,
  });
  console.log(`[shaders/delete] removed ${removed.length} files: ${removed.join(", ")}`);
  res.json({ ok: true, removed });
});

// Re-export so the bootstrap (server/src/app.ts) can warm the cache
// before the watcher starts — same shape as rebuildAssetCache.
export { rebuildShaderCache };
