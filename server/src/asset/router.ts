import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";

export const assetRouter: Router = Router();

const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".bmp",
]);

function ensureUnderRoot(absolute: string): string | null {
  const rel = path.relative(config.assetRoot, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return absolute;
}

assetRouter.get("/browse", async (req, res) => {
  const requestedDir = req.query.dir ? String(req.query.dir) : config.assetRoot;
  const resolved = path.resolve(requestedDir);
  if (!ensureUnderRoot(resolved)) {
    res.status(403).json({ error: `path outside ASSET_ROOT (${config.assetRoot})` });
    return;
  }
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    res.status(code === "ENOENT" ? 404 : 500).json({ error: String(err) });
    return;
  }
  if (!stat.isDirectory()) {
    res.status(400).json({ error: "dir is not a directory" });
    return;
  }
  let entries;
  try {
    entries = await fs.readdir(resolved, { withFileTypes: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
    return;
  }
  const dirs: { name: string; path: string; kind: "dir" }[] = [];
  const files: { name: string; path: string; kind: "file" }[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(resolved, e.name);
    if (e.isDirectory()) {
      dirs.push({ name: e.name, path: full, kind: "dir" });
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (IMAGE_EXTS.has(ext)) files.push({ name: e.name, path: full, kind: "file" });
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  const parent =
    resolved === config.assetRoot ? null : path.dirname(resolved);
  res.json({
    cwd: resolved,
    parent,
    root: config.assetRoot,
    entries: [...dirs, ...files],
  });
});

assetRouter.get("/", (req, res) => {
  const requested = String(req.query.path ?? "");
  if (!requested) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const resolved = path.resolve(requested);
  if (!ensureUnderRoot(resolved)) {
    res.status(403).json({ error: `path outside ASSET_ROOT (${config.assetRoot})` });
    return;
  }
  res.set("Cache-Control", "no-cache, must-revalidate");
  res.sendFile(resolved, (err) => {
    if (err && !res.headersSent) {
      const code = (err as NodeJS.ErrnoException).code;
      res.status(code === "ENOENT" ? 404 : 500).json({ error: String(err) });
    }
  });
});
