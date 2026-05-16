// ref handler — cross-domain reference to another authored Resource.
//
// JSON carries the target entity's key (Slug for items, Id for
// dialogs/quests/karma, NpcId for NPCs, `<folder>/<basename>`
// composite for foldered domains' balloons). The handler resolves the
// target via WriterContext.resolveRef (ProjectIndex-backed in the
// wired path), then finds or mints an ext_resource pointing at the
// target's .tres.
//
// All scripted-Resource refs in Godot use `type="Resource"` in their
// ext_resource declaration (confirmed against FoB's NPC files —
// DialogSequence + BalloonLine refs both serialize as `type="Resource"
// uid="..." path="..."`), regardless of the C# script_class. The
// handler hardcodes "Resource" rather than threading the target's
// class through the manifest.
//
// Empty / missing JSON value → null (remove the line; the orchestrator's
// final orphan-ext_resource pass cleans up any newly-dangling refs).
// Resolver returning null → warning + null. We don't synthesize a
// placeholder ext_resource for unresolved refs because that would risk
// shipping a half-broken .tres into Godot; better to leave the line
// dropped and surface a warning the user can act on.

import { findOrAddExtResource } from "../extResources.js";
import type { FieldHandler } from "../types.js";

export const refHandler: FieldHandler = (
  jsonValue,
  fieldDef,
  _section,
  propName,
  ctx,
) => {
  if (fieldDef.type !== "ref") {
    throw new Error(`refHandler: unsupported field type "${fieldDef.type}"`);
  }
  const key = coerceString(jsonValue);
  if (key === "") return null;

  const resolved = ctx.resolveRef(fieldDef.to, key);
  if (!resolved) {
    ctx.warnings.push(
      `ref ${propName}: no .tres found for ${fieldDef.to} "${key}" — line dropped`,
    );
    return null;
  }
  const { id } = findOrAddExtResource(ctx.doc, {
    type: "Resource",
    uid: resolved.uid,
    path: resolved.resPath,
  });
  return `ExtResource("${id}")`;
};

function coerceString(jsonValue: unknown): string {
  if (jsonValue === undefined || jsonValue === null) return "";
  if (typeof jsonValue === "string") return jsonValue;
  throw new Error(`ref field expects a string, got ${typeof jsonValue}`);
}
