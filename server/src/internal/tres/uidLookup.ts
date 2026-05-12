// Resolves Godot resource UIDs from project files. Used by the .tres
// mappers when they need to add a new ext_resource block — Godot requires
// the asset's actual UID, not a freshly minted one.
//
// All functions are READ-ONLY against the Godot project root.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// Finds the ItemData .tres for a slug under `world/collectibles/<category>/data/`,
// reads its UID, and returns both the UID and the `res://` path that the quest
// writer needs when minting an ext_resource. Walks category subfolders matching
// on `Slug = "<slug>"` (the category dir isn't derivable from the slug).
// Returns null if no file matches or the file has no UID.
export async function readItemUid(
  godotRoot: string,
  slug: string,
): Promise<{ uid: string; resPath: string } | null> {
  const collectiblesDir = join(godotRoot, "world", "collectibles");
  let categoryDirs;
  try {
    categoryDirs = await readdir(collectiblesDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const slugLine = `Slug = "${slug}"`;
  for (const c of categoryDirs) {
    if (!c.isDirectory()) continue;
    const dataDir = join(collectiblesDir, c.name, "data");
    let entries;
    try {
      entries = await readdir(dataDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.isFile() || !f.name.endsWith(".tres")) continue;
      const abs = join(dataDir, f.name);
      let text: string;
      try {
        text = await readFile(abs, "utf8");
      } catch {
        continue;
      }
      if (!text.includes(slugLine)) continue;
      const m = text.match(/^\[gd_resource[^\]]*\buid="([^"]+)"/m);
      if (!m) return null;
      const resPath = `res://world/collectibles/${c.name}/data/${f.name}`;
      return { uid: m[1]!, resPath };
    }
  }
  return null;
}

// Reads the BalloonLine .tres at `characters/npcs/<folder>/balloons/<basename>.tres`
// and extracts its UID. Returns null if the file is missing.
export async function readBalloonUid(
  godotRoot: string,
  folder: string,
  basename: string,
): Promise<string | null> {
  const path = join(
    godotRoot,
    "characters",
    "npcs",
    folder,
    "balloons",
    `${basename}.tres`,
  );
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
