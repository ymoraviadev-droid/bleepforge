// Single inline sub_resource reader. The .tres value is SubResource(id)
// pointing at a sub_resource section; the section's props get walked
// through the orchestrator's flat-field loop using the manifest's
// SubResource declaration's fields + fieldOrder.
//
// Unlike array entries, single subresources have positional identity —
// they're THE field on the host — so we don't populate _subId here.
// Writer-side single subresources reconcile-in-place against the
// existing section id.
//
// NpcData.LootTable is the canonical FoB instance: a single inline
// sub_resource wrapping `Entries: LootEntry[]`. The sub_resource reader
// recurses into the array reader for Entries, which recurses back into
// THIS handler for each entry — same shape as the writer's symmetric
// reconcile pipeline.
//
// Absent + nullable → null. Absent + non-nullable → null (caller may
// fall back to a default object; in practice no FoB schema has a
// non-nullable subresource that's also expected to be authored-empty).

import type { FieldDef } from "@bleepforge/shared";
import { readFlatFields } from "../orchestrator.js";
import type { ReaderContext } from "../types.js";
import type { TresValue } from "../../tresParser.js";

type SubresourceFieldDef = Extract<FieldDef, { type: "subresource" }>;

export function readSubresourceField(
  tresValue: TresValue | undefined,
  fieldDef: SubresourceFieldDef,
  propName: string,
  ctx: ReaderContext,
): Record<string, unknown> | null {
  if (tresValue === undefined) return null;
  if (tresValue.kind !== "sub_ref") {
    ctx.warnings.push(
      `prop "${propName}": expected SubResource ref, got ${tresValue.kind} — using null`,
    );
    return null;
  }
  const subDecl = ctx.subResources.get(fieldDef.of);
  if (!subDecl) {
    ctx.warnings.push(
      `prop "${propName}": sub-resource "${fieldDef.of}" not declared in manifest — using null`,
    );
    return null;
  }
  const section = ctx.parsed.subResources.get(tresValue.id);
  if (!section) {
    ctx.warnings.push(
      `prop "${propName}": SubResource id "${tresValue.id}" not declared`,
    );
    return null;
  }
  return readFlatFields(
    section.props,
    subDecl.fields,
    subDecl.fieldOrder,
    ctx,
  );
}
