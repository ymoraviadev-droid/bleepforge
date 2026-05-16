// Generic .tres importer orchestrator.
//
// Drives the per-field-type handler dispatch for a single entity. The
// caller is responsible for parsing the .tres (yielding ParsedTres); the
// orchestrator walks the manifest entry's fields, calls the right
// handler for each, and assembles the JSON value object.
//
// Symmetric with `../../tres/generic/orchestrator.ts`. The shape is
// load-bearing because Phase 5's round-trip harness will exercise
// `parse → import → write → emit` and assert byte-identical output
// against the source .tres — any asymmetry in field-walk semantics
// between writer and reader produces a diff and fails the harness.
//
// Loop shape:
//   for each prop in entry.fieldOrder:
//     if showWhen predicate fails → field absent from JSON entirely
//     else → dispatch to handler, collect normalized value
//
// `array` + `subresource` fields get their own dispatchers (same
// pattern as the writer side) because they need access to
// ParsedTres.subResources for recursion and they don't fit the flat
// scalar return shape.
//
// Returns the assembled JSON value object + accumulated warnings. Hard
// errors throw and are caught by the caller so a single bad field
// doesn't kill the whole read.

import type { Entry, FieldsRecord } from "@bleepforge/shared";
import { isFieldApplicable } from "../../tres/generic/showWhen.js";
import type { ParsedTres, TresValue } from "../tresParser.js";
import { readArrayField } from "./handlers/array.js";
import { getHandler } from "./handlers/registry.js";
import { readSubresourceField } from "./handlers/subresource.js";
import type { ReaderContext } from "./types.js";

export interface GenericReadResult {
  entity: Record<string, unknown> | null;
  warnings: string[];
}

export function readFromManifest(
  parsed: ParsedTres,
  entry: Entry,
  ctx: ReaderContext,
): GenericReadResult {
  if (entry.kind === "discriminatedFamily") {
    ctx.warnings.push(
      `generic importer: discriminatedFamily ("${entry.domain}") not yet supported`,
    );
    return { entity: null, warnings: ctx.warnings };
  }

  // Discovery happens upstream: ProjectIndex tags the .tres with its
  // domain, and the dispatcher already chose which manifest entry to
  // walk. Here we just read user-authored fields off the [resource]
  // section's props.
  const entity = readFlatFields(
    parsed.resourceProps,
    entry.fields,
    entry.fieldOrder,
    ctx,
  );
  return { entity, warnings: ctx.warnings };
}

// Reusable flat-field read loop. Used by the orchestrator for
// `domain` / `foldered` / `enumKeyed` entries today; sub_resource
// sections walk their props through the same function via the
// subresource + array handlers.
export function readFlatFields(
  props: Record<string, TresValue>,
  fields: FieldsRecord,
  fieldOrder: readonly string[],
  ctx: ReaderContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const propName of fieldOrder) {
    const fieldDef = fields[propName];
    if (!fieldDef) continue; // manifest validates fieldOrder ⊆ fields keys

    // showWhen is evaluated against the accumulator-so-far (the
    // discriminator field has to come before its dependents in
    // fieldOrder, which the manifest spec already requires). When the
    // predicate fails the field is absent from JSON entirely — matches
    // the writer's "omit line" behavior on the symmetric side.
    if (!isFieldApplicable(fieldDef.showWhen, out)) continue;

    const rawValue = props[propName];

    if (fieldDef.type === "array") {
      try {
        out[propName] = readArrayField(rawValue, fieldDef, propName, ctx);
      } catch (err) {
        ctx.warnings.push(`prop "${propName}": ${(err as Error).message}`);
      }
      continue;
    }
    if (fieldDef.type === "subresource") {
      try {
        out[propName] = readSubresourceField(rawValue, fieldDef, propName, ctx);
      } catch (err) {
        ctx.warnings.push(`prop "${propName}": ${(err as Error).message}`);
      }
      continue;
    }

    const handler = getHandler(fieldDef.type);
    if (!handler) {
      ctx.warnings.push(
        `no handler for field type "${fieldDef.type}" (prop "${propName}")`,
      );
      continue;
    }
    try {
      out[propName] = handler(rawValue, fieldDef, propName, ctx);
    } catch (err) {
      ctx.warnings.push(`prop "${propName}": ${(err as Error).message}`);
    }
  }
  return out;
}
