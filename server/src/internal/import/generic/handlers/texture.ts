// Texture reader. Two source shapes:
//
//   1. `ExtResource(id)` → standard Texture2D ext_resource. The
//      ext_resource carries a `res://...png` path, which we convert to
//      an absolute filesystem path via ctx.resPathToAbs (matches the
//      Bleepforge convention for image fields in JSON).
//
//   2. `SubResource(id)` → AtlasTexture sub_resource (a Rect2 region
//      inside a sprite-sheet ext_resource). Bleepforge's image
//      pipeline serves flat PNG bytes only, so JSON stays empty string;
//      the writer's existing reconcileTextureField preserves the
//      AtlasTexture sub_resource on save when JSON is empty. Phase 5's
//      round-trip harness validates that contract from both ends.
//
// Default-aware: absent → FieldDef.default ?? "". Authored content
// almost always leaves Icon/Banner/Portrait with explicit absolute
// paths or "" — defaults are rare here in practice.

import type { FieldReader } from "../types.js";

export const textureHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  const fallback =
    fieldDef.type === "texture" && typeof fieldDef.default === "string"
      ? fieldDef.default
      : "";
  if (tresValue === undefined) return fallback;
  if (tresValue.kind === "sub_ref") {
    // AtlasTexture preservation contract: JSON stays empty so the
    // writer's existing texture reconcile leaves the sub_resource
    // untouched on save.
    return "";
  }
  if (tresValue.kind !== "ext_ref") {
    ctx.warnings.push(
      `prop "${propName}": expected Texture2D ref, got ${tresValue.kind} — using default`,
    );
    return fallback;
  }
  const ext = ctx.parsed.extResources.get(tresValue.id);
  if (!ext) {
    ctx.warnings.push(
      `prop "${propName}": ExtResource id "${tresValue.id}" not declared in .tres header`,
    );
    return fallback;
  }
  if (!ext.path) return fallback;
  return ext.path.startsWith("res://") ? ctx.resPathToAbs(ext.path) : ext.path;
};
