// scene handler — PackedScene-shaped field.
//
// JSON holds a `res://` path (FoB convention — NpcData.LootTable
// entries' PickupScene field is the only FoB instance and stores
// res:// directly, not an absolute path). The handler accepts an
// absolute path too as a defensive fallback so future schemas that
// adopt the texture-style abs convention don't break the handler.
//
// UID resolution: WriterContext.resolveSceneUid (ProjectIndex-backed in
// the wired path). Empty / unresolved → null + warning. Non-empty +
// resolved → find or mint a PackedScene ext_resource, emit
// `ExtResource("<id>")`.

import path from "node:path";
import { findOrAddExtResource } from "../extResources.js";
import type { FieldHandler } from "../types.js";

export const sceneHandler: FieldHandler = (
  jsonValue,
  fieldDef,
  _section,
  propName,
  ctx,
) => {
  if (fieldDef.type !== "scene") {
    throw new Error(`sceneHandler: unsupported field type "${fieldDef.type}"`);
  }
  const rawValue = coerceString(jsonValue);
  if (rawValue === "") return null;

  // Normalize to res:// for ext_resource declaration. Accept either an
  // absolute fs path under godotRoot or a `res://` URI on input.
  let resPath: string;
  if (rawValue.startsWith("res://")) {
    resPath = rawValue;
  } else {
    const rel = path.relative(ctx.godotRoot, rawValue);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      ctx.warnings.push(
        `scene ${propName}: path "${rawValue}" is not under godotRoot — line dropped`,
      );
      return null;
    }
    resPath = `res://${rel.replaceAll(path.sep, "/")}`;
  }

  const uid = ctx.resolveSceneUid(resPath);
  if (!uid) {
    ctx.warnings.push(
      `scene ${propName}: no UID for "${resPath}" (not in ProjectIndex) — line dropped`,
    );
    return null;
  }

  const { id } = findOrAddExtResource(ctx.doc, {
    type: "PackedScene",
    uid,
    path: resPath,
  });
  return `ExtResource("${id}")`;
};

function coerceString(jsonValue: unknown): string {
  if (jsonValue === undefined || jsonValue === null) return "";
  if (typeof jsonValue === "string") return jsonValue;
  throw new Error(`scene field expects a string, got ${typeof jsonValue}`);
}
