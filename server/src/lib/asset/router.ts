import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../../config.js";

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
  if (isUnder(absolute, config.assetRoot)) return absolute;
  // Also allow paths under the configured Godot project root so atlas
  // textures referenced by item .tres files can be served.
  if (config.godotProjectRoot && isUnder(absolute, config.godotProjectRoot)) {
    return absolute;
  }
  return null;
}

function isUnder(absolute: string, root: string): boolean {
  const rel = path.relative(root, absolute);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

assetRouter.get("/browse", async (req, res) => {
  const requestedDir = req.query.dir ? String(req.query.dir) : config.assetRoot;
  const resolved = path.resolve(requestedDir);
  if (!ensureUnderRoot(resolved)) {
    res.status(403).json({ error: `path outside allowed roots` });
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
    res.status(403).json({ error: `path outside allowed roots` });
    return;
  }
  // Cache strategy: when the URL carries a `v` query param (any value),
  // the client has staked a claim that this URL maps to a specific
  // snapshot of bytes — by convention, the file's mtime. The server
  // doesn't validate `v`; it just trusts the URL is unique-per-version
  // and ships aggressive cache headers. When `v` is absent (older call
  // sites that haven't been wired through the mtime cache), fall back
  // to the previous no-cache behavior so edits always show up.
  //
  // Invalidation flows: on every image change the watcher publishes an
  // AssetEvent → the client's mtimeCache updates → next render of
  // AssetThumb generates a URL with the new `v=` value → browser
  // treats it as a new resource and fetches fresh.
  if (req.query.v !== undefined) {
    res.set("Cache-Control", "public, max-age=2592000, immutable");
  } else {
    res.set("Cache-Control", "no-cache, must-revalidate");
  }
  res.sendFile(resolved, (err) => {
    if (err && !res.headersSent) {
      const code = (err as NodeJS.ErrnoException).code;
      res.status(code === "ENOENT" ? 404 : 500).json({ error: String(err) });
    }
  });
});
