// Enum reader. `.tres` represents enums as their integer index; the
// FieldDef.values array maps index → string name (the form Bleepforge
// JSON uses, e.g. "Scavengers" / "CollectItem").
//
// Default-aware: absent → FieldDef.default ?? values[0]. Godot's own
// behavior is "omit property when value is the C# default int (0)",
// which aligns with values[0] being the natural fallback.
//
// Out-of-range index produces a warning + values[0] fallback rather
// than failing the read — symmetric with the writer's "warn + skip
// line" stance on bad data.

import type { FieldReader } from "../types.js";

export const enumHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  if (fieldDef.type !== "enum") {
    throw new Error(`enumHandler: unexpected type "${fieldDef.type}"`);
  }
  const first = fieldDef.values[0] ?? "";
  const fallback =
    typeof fieldDef.default === "string" ? fieldDef.default : first;
  if (tresValue === undefined) return fallback;
  if (tresValue.kind !== "number") {
    ctx.warnings.push(
      `prop "${propName}": expected enum index, got ${tresValue.kind} — using default`,
    );
    return fallback;
  }
  const idx = tresValue.value;
  const value = fieldDef.values[idx];
  if (value === undefined) {
    ctx.warnings.push(
      `prop "${propName}": enum index ${idx} out of range (0..${fieldDef.values.length - 1}) — using ${JSON.stringify(first)}`,
    );
    return first;
  }
  return value;
};
