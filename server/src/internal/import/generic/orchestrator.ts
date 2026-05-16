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
// Loop shape (Phase 2+):
//   for each prop in entry.fieldOrder:
//     if showWhen predicate fails → field absent from JSON
//     else → dispatch to handler, collect normalized value
//
// Returns the assembled JSON value object + accumulated warnings. Hard
// errors throw and are caught by the caller so a single bad field
// doesn't kill the whole read.
//
// v0.2.8 Phase 1 ships the skeleton + override registry only. Phase 2
// lands the 12 field-type handlers. Phase 3 wires this orchestrator
// into boot reconcile for manifest-discovered domains. Phase 4 wires
// the same path into watcher reimport.

import type { Entry } from "@bleepforge/shared";
import type { ParsedTres } from "../tresParser.js";
import type { ReaderContext } from "./types.js";

export interface GenericReadResult {
  entity: Record<string, unknown> | null;
  warnings: string[];
}

export function readFromManifest(
  _parsed: ParsedTres,
  entry: Entry,
  ctx: ReaderContext,
): GenericReadResult {
  if (entry.kind === "discriminatedFamily") {
    ctx.warnings.push(
      `generic importer: discriminatedFamily ("${entry.domain}") not yet supported (Phase 2+)`,
    );
    return { entity: null, warnings: ctx.warnings };
  }

  // Phase 1: skeleton only. Phase 2 lands the field-walk loop +
  // per-handler dispatch (mirrors writer's applyFlatFields).
  ctx.warnings.push(
    `generic importer: field-walk loop not yet wired (Phase 2+); domain="${entry.domain}"`,
  );
  return { entity: null, warnings: ctx.warnings };
}
