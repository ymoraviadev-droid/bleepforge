// Generic .tres writer orchestrator.
//
// Drives the per-field-type handler dispatch for a single entity. The
// caller is responsible for finding + parsing the .tres; the
// orchestrator only mutates the parsed Doc in place. Emit + atomic
// write happen in writeTres (the dispatcher).
//
// Loop shape:
//   for each prop in entry.fieldOrder:
//     if showWhen predicate fails → remove the property line
//     else → dispatch to handler, reconcile result
//
// Returns the list of accumulated warnings. Hard errors throw and are
// caught by the caller (writeTres) so a single bad field doesn't kill
// the whole write.
//
// v0.2.7 commit #2 supports `domain`, `foldered`, and `enumKeyed`
// entries — all three share a flat scalar shape on the host
// [resource] section. `discriminatedFamily` requires variant handling
// (commit #4+), and the four sub-resource-bearing entry kinds need
// array + subresource handlers (commits #4-5).

import type { Entry, FieldsRecord } from "@bleepforge/shared";
import { reconcileProperty } from "../mutate.js";
import type { Doc, Section } from "../types.js";
import { applyArrayField } from "./handlers/array.js";
import { getHandler } from "./handlers/registry.js";
import { isFieldApplicable } from "./showWhen.js";
import type { WriterContext } from "./types.js";

export interface GenericWriteResult {
  warnings: string[];
}

export function writeFromManifest(
  doc: Doc,
  entry: Entry,
  json: Record<string, unknown>,
  ctx: WriterContext,
): GenericWriteResult {
  if (entry.kind === "discriminatedFamily") {
    ctx.warnings.push(
      `generic mapper: discriminatedFamily ("${entry.domain}") not yet supported (commit #4+)`,
    );
    return { warnings: ctx.warnings };
  }

  const resourceSection = doc.sections.find((s) => s.kind === "resource");
  if (!resourceSection) {
    ctx.warnings.push("no [resource] section");
    return { warnings: ctx.warnings };
  }

  applyFlatFields(resourceSection, entry.fields, entry.fieldOrder, json, ctx);
  return { warnings: ctx.warnings };
}

// Reusable flat-field application loop. Used by the orchestrator for
// `domain` / `foldered` / `enumKeyed` entries today; commit #4-5 will
// reuse it for `discriminatedFamily` (base fields + variant extra
// fields) and for sub_resource sections (when an array/subresource
// handler reconciles their inner scalars via the same dispatch).
export function applyFlatFields(
  section: Section,
  fields: FieldsRecord,
  fieldOrder: readonly string[],
  json: Record<string, unknown>,
  ctx: WriterContext,
): void {
  for (const propName of fieldOrder) {
    const fieldDef = fields[propName];
    if (!fieldDef) continue; // manifest validates fieldOrder ⊆ fields keys

    const applicable = isFieldApplicable(fieldDef.showWhen, json);
    if (!applicable) {
      reconcileProperty(section, propName, null, fieldOrder);
      continue;
    }

    // Array fields have their own dispatcher: sub-resource arrays
    // mutate the doc (insert/remove sub_resource sections), ref arrays
    // dedup-mint ext_resources. Both update the property line via
    // reconcileProperty themselves, so the generic handler-table
    // dispatch below doesn't apply.
    if (fieldDef.type === "array") {
      applyArrayField(section, fieldOrder, propName, fieldDef, json[propName], ctx);
      continue;
    }

    const handler = getHandler(fieldDef.type);
    if (!handler) {
      // Subresource (single inline) falls here until commit #5.
      ctx.warnings.push(
        `no handler for field type "${fieldDef.type}" (prop "${propName}")`,
      );
      continue;
    }

    let rawValue: string | null;
    try {
      rawValue = handler(json[propName], fieldDef, section, propName, ctx);
    } catch (err) {
      ctx.warnings.push(`prop "${propName}": ${(err as Error).message}`);
      continue;
    }
    reconcileProperty(section, propName, rawValue, fieldOrder);
  }
}
