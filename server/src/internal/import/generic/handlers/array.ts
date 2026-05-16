// Array reader. The FieldDef.of vs FieldDef.itemRef discriminator (the
// manifest's superRefine guarantees exactly one is set) drives which
// kind of items each entry holds:
//
//   - `of: "<sub-resource>"` → each item is a SubResource(id) pointing
//     at a sub_resource section. Recurse into orchestrator.readFlatFields
//     against the sub_resource's declared fields. `_subId` is populated
//     from the section id so the writer's stable-identity matching
//     survives reorder / edit / remove on round-trip.
//
//   - `itemRef: { to: "<domain>" }` → each item is an ExtResource(id)
//     pointing at another domain's entity. Resolves through
//     ctx.resolveRefByExtResource per item; dangling refs stay verbatim
//     (mirrors single-ref handling). NpcData.CasualRemarks is the only
//     FoB instance today.
//
// Empty-array / absent semantics:
//   - Absent property → JSON empty array (`[]`). The writer's
//     reconcile-array treats an empty array as "no items"; round-trip
//     preserves either an absent line (when nullable + empty) or `[]`.
//   - Empty TresValue array (`Array[Object]([])` or `[]`) → JSON `[]`.
//
// Hard errors throw and are surfaced by orchestrator's try/catch.

import type { FieldDef } from "@bleepforge/shared";
import { readFlatFields } from "../orchestrator.js";
import type { ReaderContext } from "../types.js";
import type { TresValue } from "../../tresParser.js";

type ArrayFieldDef = Extract<FieldDef, { type: "array" }>;

export function readArrayField(
  tresValue: TresValue | undefined,
  fieldDef: ArrayFieldDef,
  propName: string,
  ctx: ReaderContext,
): unknown[] {
  if (tresValue === undefined) return [];
  if (tresValue.kind !== "array") {
    ctx.warnings.push(
      `prop "${propName}": expected array, got ${tresValue.kind} — using []`,
    );
    return [];
  }
  if (fieldDef.itemRef) {
    return readRefArray(tresValue.items, fieldDef.itemRef.to, propName, ctx);
  }
  if (fieldDef.of) {
    return readSubResourceArray(tresValue.items, fieldDef.of, propName, ctx);
  }
  // Manifest's superRefine guarantees exactly one is set; this branch
  // is unreachable in validated manifests but kept for type completeness.
  ctx.warnings.push(
    `prop "${propName}": array field missing both \`of\` and \`itemRef\` — using []`,
  );
  return [];
}

function readRefArray(
  items: TresValue[],
  targetDomain: string,
  propName: string,
  ctx: ReaderContext,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.kind !== "ext_ref") {
      ctx.warnings.push(
        `prop "${propName}"[${i}]: expected ExtResource ref, got ${item.kind} — skipping`,
      );
      continue;
    }
    const ext = ctx.parsed.extResources.get(item.id);
    if (!ext) {
      ctx.warnings.push(
        `prop "${propName}"[${i}]: ExtResource id "${item.id}" not declared`,
      );
      continue;
    }
    const resolved = ctx.resolveRefByExtResource(ext, targetDomain);
    if (resolved === null) {
      ctx.warnings.push(
        `prop "${propName}"[${i}]: ref "${ext.path}" → no entry in domain "${targetDomain}" — storing res:// verbatim`,
      );
      out.push(ext.path);
      continue;
    }
    out.push(resolved);
  }
  return out;
}

function readSubResourceArray(
  items: TresValue[],
  subResourceName: string,
  propName: string,
  ctx: ReaderContext,
): Record<string, unknown>[] {
  const subDecl = ctx.subResources.get(subResourceName);
  if (!subDecl) {
    ctx.warnings.push(
      `prop "${propName}": sub-resource "${subResourceName}" not declared in manifest — using []`,
    );
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.kind !== "sub_ref") {
      ctx.warnings.push(
        `prop "${propName}"[${i}]: expected SubResource ref, got ${item.kind} — skipping`,
      );
      continue;
    }
    const section = ctx.parsed.subResources.get(item.id);
    if (!section) {
      ctx.warnings.push(
        `prop "${propName}"[${i}]: SubResource id "${item.id}" not declared`,
      );
      continue;
    }
    const entry = readFlatFields(
      section.props,
      subDecl.fields,
      subDecl.fieldOrder,
      ctx,
    );
    // `_subId` populates from the section id so the writer can match
    // entries on round-trip without relying on JSON-content equality.
    // Symmetric with v0.2.7's migration that added _subId to existing
    // JSON via `pnpm migrate-subids`; new reads start with it set.
    entry._subId = item.id;
    out.push(entry);
  }
  return out;
}
