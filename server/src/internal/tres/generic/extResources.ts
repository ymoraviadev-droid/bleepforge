// Shared ext_resource helpers for the generic mapper's ref/texture/
// scene/array/subresource handlers.
//
// Godot files reference external assets via `[ext_resource type="..."
// uid="..." path="..." id="<num>_<5alnum>"]` declarations at the top.
// Properties downstream reference them as `ExtResource("<id>")`. When
// the mapper writes a property that needs a new asset reference, it
// must either reuse an existing matching declaration or mint a new
// one — duplicates produce the orphan-cleanup warning churn and aren't
// what Godot would emit.
//
// Identity for matching: UID is the load-bearing field (it's how
// Godot resolves refs internally). Path-only fallback exists for the
// rare case where a caller doesn't know the UID — never hit in
// practice today, but kept so the helper degrades gracefully if a
// future caller can't pre-resolve.

import {
  addExtResource,
  getAttrValue,
} from "../mutate.js";
import type { Doc } from "../types.js";

export interface FindOrAddResult {
  id: string;
  /** True when a new ext_resource was minted; false when an existing
   *  matching declaration was reused. Surfaced for warnings/diagnostics
   *  but not required for correctness. */
  minted: boolean;
}

export function findOrAddExtResource(
  doc: Doc,
  opts: { type: string; uid: string; path: string },
): FindOrAddResult {
  // Prefer UID match (Godot's true identity). Path-match falls back for
  // the rare ext_resource that was hand-edited without a uid attr —
  // doesn't happen in FoB but cheap to support.
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== opts.type) continue;
    if (getAttrValue(s, "uid") === opts.uid) {
      const id = getAttrValue(s, "id");
      if (id) return { id, minted: false };
    }
  }
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== opts.type) continue;
    if (getAttrValue(s, "path") !== opts.path) continue;
    const id = getAttrValue(s, "id");
    if (id) return { id, minted: false };
  }
  const id = addExtResource(doc, opts);
  return { id, minted: true };
}
