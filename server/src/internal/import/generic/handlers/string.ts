// String / multiline / flag reader. All three render in the editor as
// distinct controls (single-line input / textarea / autocomplete chip)
// but share an identical .tres representation — a quoted string literal,
// or absence-means-default. One handler covers all three types.
//
// Default-aware: absent property → FieldDef.default ?? "". Symmetric
// with the writer's "omit when JSON matches default" behavior.
//
// TresValue kinds we accept:
//   - "string"        canonical case
//   - "raw"           parser fallback when a value didn't fit any structured
//                     kind (rare, but the parser preserves it verbatim);
//                     handed back unmodified so a future writer pass can
//                     re-emit identical bytes
// Other kinds warn and fall back to the default.

import type { FieldReader } from "../types.js";

export const stringHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  const fallback =
    "default" in fieldDef && typeof fieldDef.default === "string"
      ? fieldDef.default
      : "";
  if (tresValue === undefined) return fallback;
  if (tresValue.kind === "string") return tresValue.value;
  if (tresValue.kind === "raw") return tresValue.value;
  ctx.warnings.push(
    `prop "${propName}": expected string, got ${tresValue.kind} — using default`,
  );
  return fallback;
};
