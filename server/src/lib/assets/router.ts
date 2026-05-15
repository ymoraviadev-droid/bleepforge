// HTTP surface for the assets gallery. Endpoints:
//
//   GET    /api/assets/images           list every discovered image
//   GET    /api/assets/usages?path=...  reverse-lookup references for one image
//   GET    /api/assets/usage-counts     per-image "used by N" map for the gallery
//   GET    /api/assets/events           SSE stream of asset add/change/remove
//   POST   /api/assets/import           write a new image into the project
//   GET    /api/assets/folders          list directories inside the content root
//   POST   /api/assets/folders          create a directory under the content root
//   DELETE /api/assets/file?path=...    remove a .png + its .png.import sidecar
//
// Anchored on config.contentRoot — the project's raw asset tree. In sync
// mode that's the Godot project (assets live among the .tres files); in
// notebook mode (phase 5+) it's the project's own content/ dir. Path
// safety checks all run through path.relative + relative-escape detect.
//
// The gallery refetches the full image list on entry and listens to the
// SSE stream for live deltas. Usages are computed on demand (per-asset
// click) so we don't burn boot time scanning every reference. Imports
// are base64-in-JSON for v1 — pixel-art assets are tiny (typically
// <100KB), no new multer dep needed; can swap to multipart later if
// users start dropping multi-MB photos for the bg-removal flow.

import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";

import { config } from "../../config.js";
import { getImage, lastRebuiltAtIso, listImages } from "./cache.js";
import { subscribeAssetEvents } from "./eventBus.js";
import { countAllUsages, findUsages } from "./usages.js";

export const assetsRouter: Router = Router();

assetsRouter.get("/images", (_req, res) => {
  res.json({
    rebuiltAt: lastRebuiltAtIso(),
    images: listImages(),
  });
});

assetsRouter.get("/usages", async (req, res) => {
  const requested = String(req.query.path ?? "");
  if (!requested) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const resolved = path.resolve(requested);
  const asset = getImage(resolved);
  if (!asset) {
    // Fall back to a synthetic descriptor so the user can still query
    // usages for a path that isn't in the cache yet (e.g. just-saved file
    // mid-watcher-debounce). UID is null in that case → only path-based
    // matches will fire, which is fine.
    res.json({
      asset: null,
      usages: await findUsages({
        path: resolved,
        basename: path.basename(resolved),
        parentDir: path.dirname(resolved),
        parentRel: "",
        format: "png",
        uid: null,
        width: null,
        height: null,
        sizeBytes: 0,
        mtimeMs: 0,
      }),
    });
    return;
  }
  const usages = await findUsages(asset);
  res.json({ asset, usages });
});

// Eager "used by N" counts for every image. Powers the gallery's
// usage pills on first paint — without this the user has to click each
// card to discover whether it's referenced. Single inverted pass over
// the project (~80ms on this corpus); cheap to recompute on demand
// rather than cache + invalidate.
assetsRouter.get("/usage-counts", async (_req, res) => {
  const images = listImages();
  const counts = await countAllUsages(
    images.map((i) => ({ path: i.path, uid: i.uid })),
  );
  res.json({ counts });
});

assetsRouter.get("/events", (req, res) => {
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

  const unsubscribe = subscribeAssetEvents((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });

  res.write(": connected\n\n");
});

// Allowed extensions for imported files. Mirrors what the discovery
// pipeline picks up, so a new file is immediately visible in the gallery
// after Godot processes its .import sidecar.
const IMPORT_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".bmp",
]);

interface ImportBody {
  /** Absolute or content-root-relative target directory under contentRoot. */
  targetDir: string;
  /** Filename including extension. Must be a basename (no slashes). */
  filename: string;
  /** Image bytes as a base64 string (no data: prefix). */
  contentBase64: string;
  /** Set true to overwrite an existing file at the target. */
  overwrite?: boolean;
}

assetsRouter.post("/import", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const body = req.body as Partial<ImportBody> | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "JSON body required" });
    return;
  }
  const targetDir = typeof body.targetDir === "string" ? body.targetDir : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
  const overwrite = body.overwrite === true;

  if (!targetDir || !filename || !contentBase64) {
    res
      .status(400)
      .json({ error: "targetDir, filename, contentBase64 are required" });
    return;
  }
  // Filename must be a plain basename — no traversal, no nested paths.
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    res.status(400).json({ error: "filename must be a basename (no slashes)" });
    return;
  }
  const ext = path.extname(filename).toLowerCase();
  if (!IMPORT_EXTS.has(ext)) {
    res.status(400).json({
      error: `unsupported extension ${ext} — allowed: ${[...IMPORT_EXTS].join(", ")}`,
    });
    return;
  }

  // Resolve the target directory and confirm it sits under contentRoot.
  // Defense in depth — even if a caller crafts a path containing `..`,
  // path.resolve normalizes it and the relative check below catches escape.
  const resolvedDir = path.resolve(config.contentRoot, targetDir);
  const rel = path.relative(config.contentRoot, resolvedDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res
      .status(403)
      .json({ error: "targetDir must be inside the project content root" });
    return;
  }

  // Make sure the directory exists and is a directory (not a file).
  let stat;
  try {
    stat = await fs.stat(resolvedDir);
  } catch {
    res.status(404).json({ error: `targetDir does not exist: ${resolvedDir}` });
    return;
  }
  if (!stat.isDirectory()) {
    res
      .status(400)
      .json({ error: `targetDir is not a directory: ${resolvedDir}` });
    return;
  }

  const targetPath = path.join(resolvedDir, filename);
  if (!overwrite) {
    try {
      await fs.access(targetPath);
      res.status(409).json({
        error: `file already exists: ${targetPath}`,
        existingPath: targetPath,
      });
      return;
    } catch {
      // ENOENT — good, the file doesn't exist; proceed.
    }
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(contentBase64, "base64");
  } catch (err) {
    res
      .status(400)
      .json({ error: `invalid base64 content: ${(err as Error).message}` });
    return;
  }
  if (bytes.byteLength === 0) {
    res.status(400).json({ error: "decoded content is empty" });
    return;
  }

  // Atomic write: temp file in the same directory + rename. Same pattern
  // the .tres writer uses; avoids partial files if the process is
  // interrupted mid-write.
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await fs.writeFile(tmpPath, bytes);
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    // Best-effort temp cleanup — the directory might still hold .tmp.*
    // if the rename itself failed; harmless in practice but tidy.
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    res.status(500).json({ error: `write failed: ${(err as Error).message}` });
    return;
  }

  console.log(`[assets/import] wrote ${bytes.byteLength} bytes → ${targetPath}`);
  // The watcher will pick this up on its own and refresh the asset cache;
  // we don't need to upsert here. The client already knows to wait for the
  // SSE event before reading back.
  res.json({
    ok: true,
    path: targetPath,
    sizeBytes: bytes.byteLength,
    overwritten: overwrite,
  });
});

// Delete an image file plus its .png.import (or equivalent) sidecar.
// Without removing the sidecar Godot errors on next focus saying the
// imported source is missing, so we always pair the two. Refuses any
// path outside contentRoot — defense in depth against a malicious or
// buggy client. Returns a list of paths actually removed so the UI can
// show what happened.
assetsRouter.delete("/file", async (req, res) => {
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
  const removed: string[] = [];
  try {
    await fs.unlink(resolved);
    removed.push(resolved);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      res.status(404).json({ error: `file does not exist: ${resolved}` });
      return;
    }
    res
      .status(500)
      .json({ error: `delete failed: ${(err as Error).message}` });
    return;
  }
  // Best-effort sidecar removal. .png → .png.import, .svg → .svg.import,
  // etc. If the sidecar isn't there, we don't treat it as an error —
  // images imported by Bleepforge before Godot processes them have no
  // sidecar yet, and that's a valid state.
  const sidecarPath = `${resolved}.import`;
  try {
    await fs.unlink(sidecarPath);
    removed.push(sidecarPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(`[assets/delete] sidecar removal failed for ${sidecarPath}: ${(err as Error).message}`);
    }
  }
  console.log(`[assets/delete] removed ${removed.length} files: ${removed.join(", ")}`);
  // The watcher will pick up the unlink event and remove from the cache;
  // the SSE stream then refreshes connected gallery views.
  res.json({ ok: true, removed });
});

// Create a new directory inside the content root. Used by the folder
// picker's "+ New folder" affordance so the user can save into a fresh
// subfolder without leaving the editor.
//
// Defense in depth same as the rest: parentDir resolved + checked
// against contentRoot; name must be a basename (no slashes, no "..",
// no leading dots) so callers can't traverse up via the name argument.
assetsRouter.post("/folders", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const body = req.body as
    | Partial<{ parentDir: string; name: string }>
    | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "JSON body required" });
    return;
  }
  const parentDir = typeof body.parentDir === "string" ? body.parentDir : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!parentDir || !name) {
    res.status(400).json({ error: "parentDir and name are required" });
    return;
  }
  if (
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".." ||
    name.startsWith(".")
  ) {
    res.status(400).json({
      error: "name must be a basename (no slashes, no leading dots)",
    });
    return;
  }
  const resolvedParent = path.resolve(config.contentRoot, parentDir);
  const rel = path.relative(config.contentRoot, resolvedParent);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res
      .status(403)
      .json({ error: "parentDir must be inside the project content root" });
    return;
  }
  // Parent must already exist + be a directory.
  let parentStat;
  try {
    parentStat = await fs.stat(resolvedParent);
  } catch {
    res.status(404).json({ error: `parentDir does not exist: ${resolvedParent}` });
    return;
  }
  if (!parentStat.isDirectory()) {
    res
      .status(400)
      .json({ error: `parentDir is not a directory: ${resolvedParent}` });
    return;
  }
  const targetPath = path.join(resolvedParent, name);
  try {
    await fs.mkdir(targetPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      res
        .status(409)
        .json({ error: `folder already exists: ${targetPath}`, path: targetPath });
      return;
    }
    res.status(500).json({ error: `mkdir failed: ${(err as Error).message}` });
    return;
  }
  console.log(`[assets/folders] created ${targetPath}`);
  res.json({ ok: true, path: targetPath });
});

// Folder picker — used by the importer to pick a destination inside the
// project. Lists subdirectories of a given dir; refuses anything outside
// contentRoot. The .godot cache and dot-dirs are filtered since they're
// never valid drop targets.
assetsRouter.get("/folders", async (req, res) => {
  if (!config.contentRoot) {
    res.status(503).json({ error: "no project content root configured" });
    return;
  }
  const root = config.contentRoot;
  const requestedDir = req.query.dir ? String(req.query.dir) : root;
  const resolved = path.resolve(requestedDir);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.status(403).json({ error: "dir must be inside the project content root" });
    return;
  }
  let entries;
  try {
    entries = await fs.readdir(resolved, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    res.status(code === "ENOENT" ? 404 : 500).json({ error: String(err) });
    return;
  }
  const dirs: { name: string; path: string }[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (!e.isDirectory()) continue;
    dirs.push({ name: e.name, path: path.join(resolved, e.name) });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  const parent = resolved === root ? null : path.dirname(resolved);
  res.json({
    cwd: resolved,
    parent,
    root,
    cwdRel: rel,
    dirs,
  });
});
