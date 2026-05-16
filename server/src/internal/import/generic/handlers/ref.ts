// Cross-domain reference reader. Reads an ExtResource(id) value, looks
// up the ext_resource, then asks ctx.resolveRefByExtResource for the
// matching entity id (ProjectIndex-backed in the wired path).
//
// Dangling refs (target not in index) stay as the verbatim res:// path
// with a warning — mirrors the writer's tolerance for dangling refs in
// JSON. Future integrity check surfaces these to the user; runtime
// behavior is "leave it alone, the user knows."
//
// Default-aware: absent → FieldDef.default ?? "". The writer interprets
// empty string as "no ref, omit the line"; round-trip preserves that.

import type { FieldReader } from "../types.js";

export const refHandler: FieldReader = (tresValue, fieldDef, propName, ctx) => {
  if (fieldDef.type !== "ref") {
    throw new Error(`refHandler: unexpected type "${fieldDef.type}"`);
  }
  const fallback =
    typeof fieldDef.default === "string" ? fieldDef.default : "";
  if (tresValue === undefined) return fallback;
  if (tresValue.kind !== "ext_ref") {
    ctx.warnings.push(
      `prop "${propName}": expected ExtResource ref, got ${tresValue.kind} — using default`,
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
  const resolved = ctx.resolveRefByExtResource(ext, fieldDef.to);
  if (resolved === null) {
    ctx.warnings.push(
      `prop "${propName}": ref "${ext.path}" → no entry in domain "${fieldDef.to}" — storing res:// path verbatim`,
    );
    return ext.path;
  }
  return resolved;
};
