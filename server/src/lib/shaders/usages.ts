// Cross-system reference search for shader assets. Answers "where is this
// shader used?" — useful before edits to gauge impact, and before deletes
// (Phase 2) to make sure nothing breaks.
//
// Shader references in the Godot corpus look like:
//   [ext_resource type="Shader" uid="uid://cm1y1ugdhsajf"
//                 path="res://shared/shaders/scanlines.gdshader" id="2_1g8jr"]
// Most live in .tscn (a node's ShaderMaterial wraps the shader at scene
// scope), some in .tres (when a ShaderMaterial is itself an authored
// resource). Both formats share the same reference shape, so we scan
// .tres + .tscn together — same pattern as the assets/usages.ts surface.
//
// No Bleepforge JSON references shaders today, so we don't scan the data
// directory at all. The assets scan needed a concept.json carve-out for
// the homepage's image fields; shader fields don't exist on any
// Bleepforge-only doc.

import {
  absoluteToResPath,
  detectTresDomainAndKey,
  pickLine,
  safeRead,
  sceneFakeDomain,
  walkGodotRefs,
  type UsageRef,
} from "../refScan/detectDomain.js";
import { config } from "../../config.js";
import type { ShaderAsset } from "./types.js";

export type { UsageRef };

export async function findShaderUsages(asset: ShaderAsset): Promise<UsageRef[]> {
  if (!config.godotProjectRoot) return [];
  const refs: UsageRef[] = [];
  const resPath = absoluteToResPath(asset.path, config.godotProjectRoot);
  const uid = asset.uid;

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

  return refs;
}

/** Minimal shape for the inverted "used by N" pass. Matches the same
 *  pattern assets/usages.ts uses for its image counts. */
export interface ShaderAssetRef {
  path: string;
  uid: string | null;
}

/**
 * Per-shader "used by N" counts in a single inverted pass. Walks every
 * .tres + .tscn under the project root once and increments a counter
 * for each shader whose res:// path or UID appears in the file.
 *
 * Counts files-referencing, not mention-count — a .tscn that wires the
 * same shader to 3 nodes still counts as 1.
 */
export async function countAllShaderUsages(
  shaders: ShaderAssetRef[],
): Promise<Record<string, number>> {
  if (!config.godotProjectRoot) return {};
  const root = config.godotProjectRoot;

  const byResPath = new Map<string, string>(); // resPath → shader.path
  const byUid = new Map<string, string>(); // uid → shader.path
  for (const sh of shaders) {
    const rp = absoluteToResPath(sh.path, root);
    if (rp) byResPath.set(rp, sh.path);
    if (sh.uid) byUid.set(sh.uid, sh.path);
  }
  const counts: Record<string, number> = Object.create(null);
  for (const sh of shaders) counts[sh.path] = 0;

  await walkGodotRefs(root, async (filePath) => {
    const text = await safeRead(filePath);
    if (!text) return;
    // Quick prefilter — same trick assets uses. Most non-trivial scenes
    // and resources contain both markers, so the prefilter is essentially
    // free for our matched-file set and a clean skip for everything else.
    if (!text.includes("res://") && !text.includes("uid://")) return;
    const seen = new Set<string>();
    for (const [rp, shaderPath] of byResPath) {
      if (text.includes(rp)) seen.add(shaderPath);
    }
    for (const [uid, shaderPath] of byUid) {
      if (text.includes(uid)) seen.add(shaderPath);
    }
    for (const p of seen) counts[p] = (counts[p] ?? 0) + 1;
  });

  return counts;
}
