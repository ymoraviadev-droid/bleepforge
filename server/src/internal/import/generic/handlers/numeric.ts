// Numeric readers (int + float). Both share a TresValue "number" kind;
// the FieldDef.type drives whether the JSON value is coerced to int via
// Math.trunc or kept as-is.
//
// Default-aware: absent → FieldDef.default ?? 0.
//
// Godot emits ints without trailing zero and floats with a decimal
// point — the parser doesn't distinguish; both arrive as
// { kind: "number", value: number }. Math.trunc on intHandler is the
// only enforcement that an int field stays integer-shaped in JSON.

import type { FieldReader } from "../types.js";

export const intHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  const fallback =
    fieldDef.type === "int" && typeof fieldDef.default === "number"
      ? Math.trunc(fieldDef.default)
      : 0;
  if (tresValue === undefined) return fallback;
  if (tresValue.kind === "number") return Math.trunc(tresValue.value);
  ctx.warnings.push(
    `prop "${propName}": expected int, got ${tresValue.kind} — using default`,
  );
  return fallback;
};

export const floatHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  const fallback =
    fieldDef.type === "float" && typeof fieldDef.default === "number"
      ? fieldDef.default
      : 0;
  if (tresValue === undefined) return fallback;
  if (tresValue.kind === "number") return tresValue.value;
  ctx.warnings.push(
    `prop "${propName}": expected float, got ${tresValue.kind} — using default`,
  );
  return fallback;
};
