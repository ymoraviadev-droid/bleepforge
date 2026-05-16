// Shared types for the generic manifest-driven mapper.
//
// Each per-field-type handler resolves a JSON value (plus its manifest
// FieldDef + writer context) to a raw `.tres` value string — the same
// shape `reconcileProperty()` expects. A null return means "this field
// should NOT appear in the .tres" (omit-when-default behavior).
//
// The handler signature is uniform across all 12 field types so the
// orchestrator can dispatch via a flat lookup table without runtime
// branching on type. Handlers that need richer effects (texture
// handler minting an ext_resource, array handler reconciling
// sub_resource sections) read/mutate via the WriterContext rather than
// returning structured side-effects.

import type { FieldDef } from "@bleepforge/shared";
import type { Doc } from "../types.js";

export interface WriterContext {
  // Absolute path to the Godot project root. Always present in sync
  // mode (writeTres gates on isSyncMode + godotProjectRoot).
  godotRoot: string;
  // The parsed .tres being mutated. Handlers that mint ext_resources
  // or reconcile sub_resource sections read/mutate this directly.
  // Commit #2 scalar handlers don't touch it; commit #3+ handlers will.
  doc: Doc;
  // Warnings funnel — handlers append non-fatal issues here. The
  // orchestrator returns the accumulated list to the caller.
  warnings: string[];
}

export type FieldHandler = (
  jsonValue: unknown,
  fieldDef: FieldDef,
  ctx: WriterContext,
) => string | null;
