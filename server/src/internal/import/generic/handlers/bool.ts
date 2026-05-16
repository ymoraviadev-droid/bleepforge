// Bool reader. `.tres` represents bools as bare `true` / `false` tokens.
// Default-aware: absent → FieldDef.default ?? false.

import type { FieldReader } from "../types.js";

export const boolHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  const fallback =
    fieldDef.type === "bool" && typeof fieldDef.default === "boolean"
      ? fieldDef.default
      : false;
  if (tresValue === undefined) return fallback;
  if (tresValue.kind === "bool") return tresValue.value;
  ctx.warnings.push(
    `prop "${propName}": expected bool, got ${tresValue.kind} — using default`,
  );
  return fallback;
};
