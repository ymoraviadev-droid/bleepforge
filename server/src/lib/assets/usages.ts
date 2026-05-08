// Cross-system reference search for image assets. Answers "is this image
// safe to delete?" / "where is X used?" — questions Godot itself can't
// easily answer.
//
// We match three reference shapes, all in the Godot project tree (plus
// one Bleepforge-only exception for the homepage):
//   1. .tres / .tscn:  `path="res://.../<file>"` (Godot's ExtResource).
//   2. .tres / .tscn:  `uid="uid://abc..."` (Godot 4.4+ UID-first refs).
//   3. data/concept.json: absolute filesystem path string match.
//
// Per-domain Bleepforge JSON cache files (data/npcs/, data/items/, …)
// are NOT scanned. They mirror their backing .tres 1:1 — every match
// would duplicate one we already produced from the .tres scan, and
// they're Bleepforge-internal anyway. Concept is the lone exception:
// Bleepforge-only homepage doc with no .tres counterpart, so without it
// we'd lie about images used on the project bible.

import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../../config.js";
import type { ImageAsset } from "./types.js";

export type UsageDomain =
  | "item"
  | "karma"
  | "quest"
  | "dialog"
  | "npc"
  | "faction"
  | "balloon"
  | "concept";

export interface UsageRef {
  /** Where this reference appears:
   *  - "tres": Godot resource file (Item / Quest / Faction / Npc / ...)
   *  - "tscn": Godot scene file (level, character scene, etc.)
   *  - "json": Bleepforge-only doc that has no .tres counterpart —
   *            currently this is just data/concept.json. We do NOT
   *            report references from the Bleepforge JSON cache
   *            (data/npcs/, data/items/, etc.) because those 1:1
   *            mirror their backing .tres and reporting them
   *            double-counts every usage. */
  kind: "tres" | "tscn" | "json";
  /** Bleepforge-shaped domain so the client can build a link back.
   *  Scene refs (.tscn) don't map to a Bleepforge edit page (we don't
   *  author scenes here), so domain stays null and the file path is the
   *  meaningful info. */
  domain: UsageDomain | null;
  /** Routing key — primary id, or "<folder>/<id>" for folder-aware domains. */
  key: string | null;
  /** Absolute file path of the .tres / .tscn / concept.json file. */
  file: string;
  /** Short context snippet for display. */
  snippet: string;
}

export async function findUsages(asset: ImageAsset): Promise<UsageRef[]> {
  if (!config.godotProjectRoot) return [];
  const refs: UsageRef[] = [];
  const resPath = absoluteToResPath(asset.path, config.godotProjectRoot);
  const uid = asset.uid;

  // .tres + .tscn scan. Both formats reference textures via ExtResource
  // — same path/UID strings live in scenes as in resources. Many sprites
  // are placed in scenes (level art, characters in their own .tscn),
  // and skipping .tscn would massively undercount. Corpus is small (<200
  // files combined) so a fresh walk per query is fine.
  await walkGodotRefs(config.godotProjectRoot, async (filePath) => {
    const text = await safeRead(filePath);
    if (!text) return;
    let matched = false;
    let snippet = "";
    if (resPath && text.includes(resPath)) {
      matched = true;
      snippet = pickLine(text, resPath);
    } else if (uid && text.includes(uid)) {
      matched = true;
      snippet = pickLine(text, uid);
    }
    if (!matched) return;
    const isScene = filePath.endsWith(".tscn");
    const { domain, key } = isScene
      ? sceneFakeDomain(filePath, config.godotProjectRoot!)
      : await detectTresDomainAndKey(filePath, config.godotProjectRoot!);
    refs.push({
      kind: isScene ? "tscn" : "tres",
      domain,
      key,
      file: filePath,
      snippet,
    });
  });

  // We deliberately skip the per-domain JSON cache (data/npcs/,
  // data/items/, etc.) — those mirror their .tres 1:1, so each match
  // there would duplicate a match we've already produced from the
  // .tres scan above.
  //
  // The one Bleepforge JSON we DO scan is concept.json: it has no .tres
  // counterpart (Bleepforge-only homepage doc) so without it we'd lie
  // about images used on the project bible.
  const conceptPath = path.join(config.dataRoot, "concept.json");
  const conceptText = await safeRead(conceptPath);
  if (conceptText && conceptText.includes(asset.path)) {
    refs.push({
      kind: "json",
      domain: "concept",
      key: null,
      file: conceptPath,
      snippet: pickLine(conceptText, asset.path),
    });
  }

  return refs;
}

function absoluteToResPath(absPath: string, godotRoot: string): string | null {
  const rel = path.relative(godotRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `res://${rel.replaceAll(path.sep, "/")}`;
}

async function safeRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

function pickLine(text: string, needle: string): string {
  const idx = text.indexOf(needle);
  if (idx < 0) return needle;
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  const lineEnd = text.indexOf("\n", idx);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  // Cap length so the UI doesn't get a 400-char dump on big lines.
  return line.length > 160 ? line.slice(0, 157) + "…" : line;
}

async function walkGodotRefs(
  dir: string,
  onFile: (full: string) => Promise<void>,
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
      await walkGodotRefs(full, onFile);
    } else if (
      e.isFile() &&
      (e.name.endsWith(".tres") || e.name.endsWith(".tscn"))
    ) {
      await onFile(full);
    }
  }
}

// Scenes don't map to a Bleepforge editor — we don't author .tscn here.
// Return a useful key for the UI (file basename, no extension) so the
// usages drawer still has something to display, with domain=null.
function sceneFakeDomain(
  scenePath: string,
  godotRoot: string,
): { domain: null; key: string } {
  const rel = path.relative(godotRoot, scenePath);
  return { domain: null, key: rel.replace(/\.tscn$/, "") };
}

// Domain detection from a .tres path. We don't need a perfect match for
// every authored type — the existing import/discover.ts is the source of
// truth, but for the gallery's "where is this used" link we just need
// good enough heuristics to land on the right edit page. Reads the file
// header to pick up Slug / Id; falls back to filename basename.
async function detectTresDomainAndKey(
  tresPath: string,
  godotRoot: string,
): Promise<{ domain: UsageDomain | null; key: string | null }> {
  const text = await safeRead(tresPath);
  if (!text) return { domain: null, key: null };
  const scriptClass = /script_class="([^"]+)"/.exec(text)?.[1] ?? null;
  const slug = /^\s*Slug\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const idMatch = /^\s*Id\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const npcId = /^\s*NpcId\s*=\s*"([^"]+)"/m.exec(text)?.[1];

  switch (scriptClass) {
    case "Quest":
      return { domain: "quest", key: idMatch ?? basenameNoExt(tresPath) };
    case "KarmaImpact":
      return { domain: "karma", key: idMatch ?? basenameNoExt(tresPath) };
    case "FactionData": {
      const factionInt = /^\s*Faction\s*=\s*(\d+)/m.exec(text)?.[1];
      const name = factionFromInt(factionInt);
      return { domain: "faction", key: name };
    }
    case "NpcData":
      return { domain: "npc", key: npcId ?? basenameNoExt(tresPath) };
    case "DialogSequence": {
      const folder = path.basename(path.dirname(tresPath));
      return { domain: "dialog", key: `${folder}/${idMatch ?? basenameNoExt(tresPath)}` };
    }
    case "BalloonLine": {
      // Convention: characters/npcs/<model>/balloons/<basename>.tres.
      const parent = path.dirname(tresPath);
      if (path.basename(parent) === "balloons") {
        const folder = path.basename(path.dirname(parent));
        return { domain: "balloon", key: `${folder}/${basenameNoExt(tresPath)}` };
      }
      return { domain: "balloon", key: null };
    }
    default:
      if (slug) return { domain: "item", key: slug };
      return { domain: null, key: null };
  }
}

function basenameNoExt(p: string): string {
  const base = path.basename(p);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}

function factionFromInt(raw: string | undefined): string | null {
  // Mirrors FACTION_BY_INDEX in the existing importer. Kept inline so the
  // usages module doesn't reach into the importer's internals for a 4-row
  // table.
  switch (raw) {
    case "0":
      return "Scavengers";
    case "1":
      return "FreeRobots";
    case "2":
      return "RFF";
    case "3":
      return "Grove";
    default:
      return null;
  }
}

/**
 * Compute "used by N" counts for every image in the cache in a single
 * inverted pass — walk every .tres / .tscn / JSON file once, scan each
 * for references to any known image (by res:// path, UID, or absolute
 * path), increment that image's counter. This is much cheaper than
 * calling findUsages per image (N×M scans → N+M scans), and it's what
 * the gallery page uses to show counts on initial load instead of
 * lazily on click.
 *
 * Counts files-referencing, not mention-count: a single .tres / .tscn
 * counts as 1 even if it mentions the image multiple times (which a
 * tilemap or repeated sprite scene can).
 */
export async function countAllUsages(
  images: ImageAssetRef[],
): Promise<Record<string, number>> {
  if (!config.godotProjectRoot) return {};
  const root = config.godotProjectRoot;

  // Index images by lookup key so we can answer "does this file mention
  // any known image?" without an N-image inner loop per file. Each
  // image gets two index entries (resPath + uid) when both exist; for
  // JSON we use the absolute filesystem path as the key.
  const byResPath = new Map<string, string>(); // resPath → asset.path
  const byUid = new Map<string, string>(); // uid → asset.path
  const byAbsPath: string[] = []; // for JSON scan
  for (const img of images) {
    const rp = absoluteToResPath(img.path, root);
    if (rp) byResPath.set(rp, img.path);
    if (img.uid) byUid.set(img.uid, img.path);
    byAbsPath.push(img.path);
  }
  const counts: Record<string, number> = Object.create(null);
  for (const img of images) counts[img.path] = 0;

  // Pass 1: every .tres + .tscn under the project root.
  await walkGodotRefs(root, async (filePath) => {
    const text = await safeRead(filePath);
    if (!text) return;
    const seen = new Set<string>();
    // Quick prefilter: if neither "res://" nor "uid://" appears, skip.
    if (!text.includes("res://") && !text.includes("uid://")) return;
    for (const [rp, assetPath] of byResPath) {
      if (text.includes(rp)) seen.add(assetPath);
    }
    for (const [uid, assetPath] of byUid) {
      if (text.includes(uid)) seen.add(assetPath);
    }
    for (const p of seen) counts[p] = (counts[p] ?? 0) + 1;
  });

  // We deliberately skip the per-domain JSON cache (data/npcs/,
  // data/items/, etc.) — those mirror their .tres 1:1 and would
  // double-count every reference we already produced from pass 1.

  // Pass 2: data/concept.json (singleton — Logo / Icon / SplashImage).
  const conceptPath = path.join(config.dataRoot, "concept.json");
  const conceptText = await safeRead(conceptPath);
  if (conceptText) {
    const seen = new Set<string>();
    for (const ap of byAbsPath) {
      if (conceptText.includes(ap)) seen.add(ap);
    }
    for (const p of seen) counts[p] = (counts[p] ?? 0) + 1;
  }

  return counts;
}

/** Minimal shape needed by countAllUsages — a subset of the full
 *  ImageAsset descriptor. Decouples this module from the cache type. */
export interface ImageAssetRef {
  path: string;
  uid: string | null;
}

