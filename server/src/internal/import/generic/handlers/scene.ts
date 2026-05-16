// PackedScene reader. ExtResource(id) → the res:// path of the .tscn,
// preserved verbatim in JSON. Matches the FoB convention for the only
// scene field today (NpcData LootEntry.PickupScene), where the writer
// also stores res:// paths and resolves UID lookups through ProjectIndex
// at save time.
//
// Why verbatim res:// (not absolute path like textures)? Scenes are
// always relative to the Godot project root and are loaded via Godot's
// own resource system, never read as file bytes by Bleepforge. The
// res:// form is portable across machines (same project, different
// absolute path on disk) and matches what Godot itself stores. Textures
// go the other way because Bleepforge's asset router needs absolute
// filesystem paths to actually serve the PNG bytes.
//
// Default-aware: absent → FieldDef.default ?? "".

import type { FieldReader } from "../types.js";

export const sceneHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  const fallback =
    fieldDef.type === "scene" && typeof fieldDef.default === "string"
      ? fieldDef.default
      : "";
  if (tresValue === undefined) return fallback;
  if (tresValue.kind !== "ext_ref") {
    ctx.warnings.push(
      `prop "${propName}": expected PackedScene ref, got ${tresValue.kind} — using default`,
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
  return ext.path ?? fallback;
};
