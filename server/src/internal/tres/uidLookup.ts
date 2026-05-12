// Resolves Godot resource UIDs from project files. Used by the .tres
// mappers when they need to add a new ext_resource block — Godot requires
// the asset's actual UID, not a freshly minted one.
//
// All functions are READ-ONLY against the Godot project root.
//
// Item / balloon / scene UID lookups go through the ProjectIndex (built
// at boot, kept live by the watcher) — content-driven, no hardcoded
// folder paths. The script-UID cross-reference still walks via the
// index since it needs to scan every .tres for the reference; texture
// UIDs still read the `.png.import` sidecar directly because images
// aren't in the project index (they're in the asset cache, but its
// shape is different and pulling UIDs from there is a Phase 2 follow-up
// — for now the sidecar read is a single small file and doesn't burn
// boot time).

import { readFile } from "node:fs/promises";

import { projectIndex } from "../../lib/projectIndex/index.js";

// Finds the ItemData .tres for a slug via ProjectIndex, returns the
// uid + res:// path needed when minting an ext_resource. Returns null
// if the item isn't indexed (slug doesn't match any known item) or if
// the .tres lacks a uid in its [gd_resource] header.
export async function readItemUid(
  _godotRoot: string,
  slug: string,
): Promise<{ uid: string; resPath: string } | null> {
  const entry = projectIndex.get("item", slug);
  if (!entry || !entry.uid) return null;
  return { uid: entry.uid, resPath: entry.resPath };
}

// Reads the UID of a BalloonLine .tres via ProjectIndex. The composite
// `<model>/<basename>` key is what the index uses internally.
export async function readBalloonUid(
  _godotRoot: string,
  folder: string,
  basename: string,
): Promise<string | null> {
  const entry = projectIndex.get("balloon", `${folder}/${basename}`);
  return entry?.uid ?? null;
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

// Reads the UID of a pickup `.tscn` (PackedScene) via ProjectIndex.
// `scenePath` is `res://...`.
export async function readSceneUid(
  _godotRoot: string,
  scenePath: string,
): Promise<string | null> {
  const entry = projectIndex.getByResPath(scenePath);
  return entry?.uid ?? null;
}

// Walks the indexed .tres files for any that declare an
// `[ext_resource type="Script" path="<scriptResPath>"]`, and returns the
// referenced script's UID. Used to add a script ext_resource even when
// the current file doesn't yet have one.
//
// Returns null if no .tres in the project references the script.
export async function findScriptUidInProject(
  _godotRoot: string,
  scriptResPath: string,
): Promise<string | null> {
  const target = `path="${scriptResPath}"`;
  // Iterate every indexed .tres entry (across all domains) and content-
  // search for the script reference. Cost is O(n × size); ~90 small
  // files in the corpus, so trivial.
  const allDomains = [
    "item",
    "quest",
    "karma",
    "faction",
    "npc",
    "dialog",
    "balloon",
  ] as const;
  for (const d of allDomains) {
    for (const entry of projectIndex.list(d)) {
      let text: string;
      try {
        text = await readFile(entry.absPath, "utf8");
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
  }
  return null;
}
