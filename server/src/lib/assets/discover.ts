// Walks the Godot project and collects every image asset, parsing each
// .png.import / .svg.import sidecar for its UID and probing the file
// itself for dimensions. Cheap on this corpus (~40 images today) — full
// rewalk costs <100ms — so we don't bother caching the walk; the cache
// module above us holds the result and refreshes deltas via watcher.
//
// Mirrors the .tres discovery pattern in import/discover.ts but for
// raster/vector assets. Skips dot-dirs (the .godot import cache lives
// there and would otherwise flood us with derived files).

import fs from "node:fs/promises";
import path from "node:path";

import { readImageDims } from "./imageDims.js";
import type { ImageAsset, ImageFormat } from "./types.js";

const IMAGE_EXTS: Record<string, ImageFormat> = {
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".webp": "webp",
  ".gif": "gif",
  ".svg": "svg",
  ".bmp": "bmp",
};

const UID_RE = /\buid\s*=\s*"(uid:\/\/[a-z0-9]+)"/i;

export function imageExtensionsLowercase(): string[] {
  return Object.keys(IMAGE_EXTS);
}

export function isImagePath(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  return ext in IMAGE_EXTS;
}

export async function discoverImages(godotRoot: string): Promise<ImageAsset[]> {
  const out: ImageAsset[] = [];
  await walk(godotRoot, godotRoot, out);
  return out;
}

async function walk(
  dir: string,
  godotRoot: string,
  out: ImageAsset[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, godotRoot, out);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    const format = IMAGE_EXTS[ext];
    if (!format) continue;
    const summary = await summarizeImage(full, godotRoot, format);
    if (summary) out.push(summary);
  }
}

export async function summarizeImage(
  absPath: string,
  godotRoot: string,
  format: ImageFormat,
): Promise<ImageAsset | null> {
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return null;
  }
  const [uid, dims] = await Promise.all([
    readSidecarUid(absPath),
    readImageDims(absPath),
  ]);
  const parentDir = path.dirname(absPath);
  const parentRel = path.relative(godotRoot, parentDir);
  return {
    path: absPath,
    basename: path.basename(absPath),
    parentDir,
    parentRel,
    format,
    uid,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

// Reads `<image>.import` if present and pulls the UID line out. Returns
// null if there's no sidecar (e.g. an image that hasn't been imported by
// Godot yet, or a file outside the conventional pipeline).
async function readSidecarUid(imagePath: string): Promise<string | null> {
  const sidecar = `${imagePath}.import`;
  try {
    const text = await fs.readFile(sidecar, "utf8");
    const m = UID_RE.exec(text);
    return m && m[1] ? m[1] : null;
  } catch {
    return null;
  }
}
