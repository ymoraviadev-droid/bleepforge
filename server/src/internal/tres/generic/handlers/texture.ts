// texture handler — Texture2D-shaped field.
//
// JSON holds an absolute filesystem path or empty string. The .tres
// holds either an ext_resource ref (`ExtResource("<id>")` pointing at
// a Texture2D), an AtlasTexture sub_resource (`SubResource("<id>")`),
// or nothing.
//
// Non-obvious case: AtlasTexture preservation. Several FoB items
// (medkit, optical_part, etc.) have icons authored as AtlasTexture
// sub_resources — a rect inside a sprite sheet. Bleepforge's image
// pipeline serves flat PNGs only, so it doesn't author atlases; the
// importer reads them as an empty string. If the generic mapper
// blindly removed empty-JSON lines, every save would destroy the
// user's hand-crafted atlas region. Three cases for empty JSON:
//
//   - Existing line is SubResource (AtlasTexture)   → preserve.
//   - Existing line is Texture2D ExtResource         → remove (user cleared).
//   - No existing line                               → noop.
//
// Non-empty JSON path: convert abs → res://, find or mint a Texture2D
// ext_resource, emit `ExtResource("<id>")`. When swapping from an
// AtlasTexture SubResource to a Texture2D ExtResource, the orphaned
// AtlasTexture sub_resource is dropped so the post-pass orphan-cleanup
// can also remove the sprite-sheet ext_resource it referenced via its
// `atlas` field.

import path from "node:path";
import {
  getAttrValue,
  removeSectionById,
} from "../../mutate.js";
import type { Section } from "../../types.js";
import { findOrAddExtResource } from "../extResources.js";
import type { FieldHandler, WriterContext } from "../types.js";

export const textureHandler: FieldHandler = (
  jsonValue,
  fieldDef,
  section,
  propName,
  ctx,
) => {
  if (fieldDef.type !== "texture") {
    throw new Error(`textureHandler: unsupported field type "${fieldDef.type}"`);
  }
  const absPath = coerceString(jsonValue);

  const existingRaw = readExistingRawValue(section, propName);
  const existingIsSubResource =
    existingRaw !== null && /^SubResource\(/.test(existingRaw);

  if (absPath === "") {
    if (existingIsSubResource) {
      // Preserve — return the existing raw value verbatim. reconcileProperty
      // sees a matching value and no-ops.
      return existingRaw;
    }
    return null;
  }

  const resPath = absToResPath(ctx.godotRoot, absPath);
  if (!resPath) {
    ctx.warnings.push(
      `texture ${propName}: path "${absPath}" is not under godotRoot — line left unchanged`,
    );
    return existingRaw; // no-op
  }

  const uid = ctx.resolveTextureUid(absPath);
  if (!uid) {
    ctx.warnings.push(
      `texture ${propName}: no .import sidecar UID for "${absPath}" — line left unchanged`,
    );
    return existingRaw; // no-op
  }

  const { id } = findOrAddExtResource(ctx.doc, {
    type: "Texture2D",
    uid,
    path: resPath,
  });
  const newRaw = `ExtResource("${id}")`;

  // If we just replaced an AtlasTexture SubResource, drop the orphaned
  // sub_resource so its inner `atlas = ExtResource(...)` reference
  // releases for the final orphan-ext-resource cleanup pass.
  if (existingIsSubResource) {
    const m = existingRaw!.match(/^SubResource\("([^"]+)"\)/);
    const subId = m ? m[1]! : null;
    if (subId) {
      const sub = ctx.doc.sections.find(
        (s) => s.kind === "sub_resource" && getAttrValue(s, "id") === subId,
      );
      if (sub && getAttrValue(sub, "type") === "AtlasTexture") {
        removeSectionById(ctx.doc, "sub_resource", subId);
      }
    }
  }

  return newRaw;
};

function coerceString(jsonValue: unknown): string {
  if (jsonValue === undefined || jsonValue === null) return "";
  if (typeof jsonValue === "string") return jsonValue;
  throw new Error(`texture field expects a string, got ${typeof jsonValue}`);
}

function readExistingRawValue(section: Section, key: string): string | null {
  const entry = section.body.find(
    (e) => e.kind === "property" && e.key === key,
  );
  if (!entry || entry.kind !== "property") return null;
  return entry.rawAfterEquals.trim();
}

// Mirror of textureRef.ts's absToResPath. Duplicated here so the generic
// mapper doesn't depend on the legacy per-domain texture helper; the two
// will live in parallel until the per-domain texture path retires.
function absToResPath(godotRoot: string, absPath: string): string | null {
  const rel = path.relative(godotRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `res://${rel.replaceAll(path.sep, "/")}`;
}
