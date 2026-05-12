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

import path from "node:path";

import { config } from "../../config.js";
import {
  absoluteToResPath,
  detectTresDomainAndKey,
  pickLine,
  safeRead,
  sceneFakeDomain,
  walkGodotRefs,
  type UsageDomain,
  type UsageRef,
} from "../refScan/detectDomain.js";
import type { ImageAsset } from "./types.js";

// Re-export so existing callers of this module's types still work.
export type { UsageDomain, UsageRef };

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

