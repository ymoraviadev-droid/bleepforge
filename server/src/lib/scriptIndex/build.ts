// Walks .cs files under godotRoot, pairs each with its .cs.uid sidecar.
//
// Godot 4.4+ emits a `.cs.uid` sidecar next to every `.cs` file in the
// project; the file's UID is the single line `uid://...`. Bleepforge
// uses these UIDs when minting script ext_resources for newly-created
// sub_resource sections (so Godot resolves the script reference
// correctly on re-load).
//
// Class-name → script mapping uses the C# convention "class FooBar
// lives in FooBar.cs". This holds throughout FoB; the v0.2.6 godot-lib
// spec doesn't require it but recommends it. Files that violate it
// won't be found by class lookup — but they also can't be referenced
// as sub-resources from any v0.2.7 manifest entry, so the lookup
// failure is appropriate.
//
// Skips dot-dirs (notably `.godot/` — Godot's import cache contains
// thousands of generated files we don't want to walk).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { IndexedScript } from "./types.js";

const DOT_DIR_RE = /^\./;

export async function walkScripts(root: string): Promise<IndexedScript[]> {
  const out: IndexedScript[] = [];
  await walkDir(root, root, out);
  return out;
}

async function walkDir(
  root: string,
  dir: string,
  out: IndexedScript[],
): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (DOT_DIR_RE.test(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkDir(root, abs, out);
      continue;
    }
    if (!ent.isFile() || !ent.name.endsWith(".cs")) continue;
    const className = ent.name.slice(0, -".cs".length);
    const uid = await readUidSidecar(`${abs}.uid`);
    out.push({
      className,
      absPath: abs,
      resPath: absToResPath(root, abs),
      uid,
    });
  }
}

async function readUidSidecar(absUidPath: string): Promise<string | null> {
  let text: string;
  try {
    text = await fs.readFile(absUidPath, "utf8");
  } catch {
    return null;
  }
  const trimmed = text.trim();
  return trimmed.startsWith("uid://") ? trimmed : null;
}

function absToResPath(root: string, abs: string): string {
  const rel = path.relative(root, abs);
  return `res://${rel.replaceAll(path.sep, "/")}`;
}
