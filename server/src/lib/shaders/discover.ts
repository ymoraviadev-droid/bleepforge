// Walks the Godot project for .gdshader files, parses each one's header
// (shader_type + uniform count) and reads its .gdshader.uid sidecar.
// Corpus is tiny (single-digit shaders today; will grow slowly) so the
// walk + parse cost is negligible — Phase 1 re-walks on every list call
// rather than maintaining a cache. The cache module lands in Phase 2 when
// SSE / watcher integration arrives.
//
// .gdshaderinc include files are deliberately skipped: they're support
// files, not standalone authored shaders, and the translator's #include
// support is out of v1 scope. They'd show up as separate cards with
// no shader_type which would confuse the user.

import fs from "node:fs/promises";
import path from "node:path";

import { getShaderPattern } from "./meta.js";
import { parseShaderHeader } from "./parseHeader.js";
import type { ShaderAsset } from "./types.js";

const UID_RE = /^\s*uid\s*=\s*"?(uid:\/\/[a-z0-9]+)"?\s*$/im;

export async function discoverShaders(godotRoot: string): Promise<ShaderAsset[]> {
  const out: ShaderAsset[] = [];
  await walk(godotRoot, godotRoot, out);
  return out;
}

async function walk(
  dir: string,
  godotRoot: string,
  out: ShaderAsset[],
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
    if (!e.name.endsWith(".gdshader")) continue;
    const summary = await summarizeShader(full, godotRoot);
    if (summary) out.push(summary);
  }
}

export async function summarizeShader(
  absPath: string,
  godotRoot: string,
): Promise<ShaderAsset | null> {
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return null;
  }
  const [source, uid] = await Promise.all([
    safeReadText(absPath),
    readSidecarUid(absPath),
  ]);
  const header = source ? parseShaderHeader(source) : { shaderType: null, uniformCount: 0 };
  const parentDir = path.dirname(absPath);
  const parentRel = path.relative(godotRoot, parentDir);
  const relPath = path.relative(godotRoot, absPath);
  return {
    path: absPath,
    basename: path.basename(absPath),
    parentDir,
    parentRel,
    uid,
    shaderType: header.shaderType,
    uniformCount: header.uniformCount,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    pattern: getShaderPattern(relPath),
  };
}

async function safeReadText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

// Reads `<shader>.gdshader.uid` if present and pulls the UID out. The
// .uid sidecar in this corpus is a single-line file containing just the
// uid (`uid://cm1y1ugdhsajf\n`), not the keyed format the .png.import
// sidecars use. We try both shapes so a future Godot version that switches
// to keyed form (`uid="uid://..."`) still works.
async function readSidecarUid(shaderPath: string): Promise<string | null> {
  const sidecar = `${shaderPath}.uid`;
  try {
    const text = (await fs.readFile(sidecar, "utf8")).trim();
    if (text.startsWith("uid://")) return text;
    const m = UID_RE.exec(text);
    return m && m[1] ? m[1] : null;
  } catch {
    return null;
  }
}
