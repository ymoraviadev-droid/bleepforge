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
import type { Doc, Section } from "../types.js";

// Resolver callbacks the orchestrator's caller (writeTres in the wired
// path, or a smoke test for synthetic input) populates before invoking
// the orchestrator. The resolvers are synchronous — async UID lookups
// (sidecar reads, project walks) happen upstream so the handlers can
// stay in one mutation pass. Returning null is the resolver's way of
// signalling "I couldn't find it" — handlers translate that into a
// warning + a no-op rather than a hard error.
export interface RefResolution {
  uid: string;
  resPath: string;
}

export interface WriterContext {
  // Absolute path to the Godot project root. Always present in sync
  // mode (writeTres gates on isSyncMode + godotProjectRoot).
  godotRoot: string;
  // The parsed .tres being mutated. Handlers that mint ext_resources
  // or reconcile sub_resource sections read/mutate this directly.
  doc: Doc;
  // Warnings funnel — handlers append non-fatal issues here. The
  // orchestrator returns the accumulated list to the caller.
  warnings: string[];

  // ref handler: look up a cross-domain reference target by domain +
  // key. ProjectIndex-backed in the wired path.
  resolveRef: (domain: string, key: string) => RefResolution | null;
  // texture handler: read the Godot UID for a texture given its
  // absolute filesystem path. `.png.import` sidecar in the wired path.
  resolveTextureUid: (absPath: string) => string | null;
  // scene handler: read the Godot UID for a PackedScene. Accepts
  // either a `res://` path (FoB JSON convention) or an absolute fs
  // path. ProjectIndex.getByResPath in the wired path.
  resolveSceneUid: (resPathOrAbsPath: string) => string | null;
}

export type FieldHandler = (
  jsonValue: unknown,
  fieldDef: FieldDef,
  section: Section,
  propName: string,
  ctx: WriterContext,
) => string | null;
