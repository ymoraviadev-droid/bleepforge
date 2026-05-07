// Resolves Godot resource UIDs from project files. Used by the .tres
// mappers when they need to add a new ext_resource block — Godot requires
// the asset's actual UID, not a freshly minted one.
//
// All functions are READ-ONLY against the Godot project root.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// Reads `<root>/shared/items/data/<slug>.tres` and extracts the UID from
// its `[gd_resource ... uid="uid://..."]` header. Returns null if the file
// can't be read or has no UID.
export async function readItemUid(godotRoot: string, slug: string): Promise<string | null> {
  const path = join(godotRoot, "shared", "items", "data", `${slug}.tres`);
  return readGdResourceUid(path);
}

// Reads `<absPngPath>.import` and extracts the UID under [remap]. Godot
// stores texture UIDs in the .import sidecar, not the PNG itself.
// `absPngPath` is the absolute filesystem path of the PNG.
export async function readTextureUid(absPngPath: string): Promise<string | null> {
  const importPath = `${absPngPath}.import`;
  let text: string;
  try {
    text = await readFile(importPath, "utf8");
  } catch {
    return null;
  }
  const m = text.match(/^uid="([^"]+)"/m);
  return m ? m[1]! : null;
}

// Reads a `.tscn` (PackedScene) header and extracts its UID — the
// `uid="uid://..."` attribute on `[gd_scene ...]`. Used by the NpcData
// LootTable writer to add a PackedScene ext_resource for a LootEntry's
// PickupScene reference.
//
// `scenePath` is `res://world/collectibles/.../<name>.tscn`.
export async function readSceneUid(
  godotRoot: string,
  scenePath: string,
): Promise<string | null> {
  if (!scenePath.startsWith("res://")) return null;
  const abs = join(godotRoot, scenePath.substring("res://".length));
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch {
    return null;
  }
  const m = text.match(/^\[gd_scene\b[^\]]*\buid="([^"]+)"/m);
  return m ? m[1]! : null;
}

// Walks the Godot project for any .tres that declares an `[ext_resource
// type="Script" path="<scriptResPath>"]`, and returns its UID. Lets us
// add a script ext_resource even when the current file doesn't yet have it.
//
// Returns null if no other .tres in the project references the script.
export async function findScriptUidInProject(
  godotRoot: string,
  scriptResPath: string,
): Promise<string | null> {
  const target = `path="${scriptResPath}"`;
  const tresFiles: string[] = [];
  await walkTres(godotRoot, tresFiles);
  for (const abs of tresFiles) {
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    if (!text.includes(target)) continue;
    // Match the line with both type="Script" and the path. Capture uid.
    const re = /\[ext_resource\s+[^\]]*type="Script"[^\]]*uid="([^"]+)"[^\]]*path="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[2] === scriptResPath) return m[1]!;
    }
    // Attribute order varies; try the inverse order too.
    const re2 = /\[ext_resource\s+[^\]]*path="([^"]+)"[^\]]*uid="([^"]+)"[^\]]*type="Script"/g;
    while ((m = re2.exec(text)) !== null) {
      if (m[1] === scriptResPath) return m[2]!;
    }
  }
  return null;
}

// ---- Helpers ---------------------------------------------------------------

async function readGdResourceUid(absPath: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch {
    return null;
  }
  const m = text.match(/^\[gd_resource[^\]]*\buid="([^"]+)"/m);
  return m ? m[1]! : null;
}

async function walkTres(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".godot" || e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walkTres(full, out);
    else if (e.isFile() && e.name.endsWith(".tres")) out.push(full);
  }
}
