// Shared types for the generic manifest-driven importer.
//
// Each per-field-type handler resolves a raw TresValue (from
// ParsedTres.resourceProps or a sub_resource's props) plus its manifest
// FieldDef + reader context to a normalized JSON value — the same shape
// each domain's JSON schema (or the manifest-derived JSON shape) holds.
// `undefined` raw input means "this property isn't present in the .tres",
// which handlers translate to the field's default per FieldDef.default.
//
// The handler signature is uniform across all 12 field types so the
// orchestrator can dispatch via a flat lookup table without runtime
// branching on type. Handlers that need ext_resource lookups read
// through ctx; sub_resource handlers recurse through the orchestrator
// rather than reading the parsed Doc directly.
//
// Symmetric with v0.2.7's writer-side types — every load-bearing detail
// the writer's WriterContext carries has a reader-side counterpart here.

import type { FieldDef, SubResource } from "@bleepforge/shared";
import type { ParsedTres, TresExtResource, TresValue } from "../tresParser.js";

export interface ReaderContext {
  // Absolute path to the Godot project root. Always present — the
  // boot reconcile gates on it, and watcher reimport receives it via
  // the same config lookup the writer uses.
  godotRoot: string;
  // Path of the .tres being imported. Surfaces in warnings for
  // operator debugging.
  filePath: string;
  // The parsed .tres being read. Handlers that follow ext_resource
  // refs (texture / scene / ref) consult `parsed.extResources` here.
  parsed: ParsedTres;
  // Warnings funnel — handlers append non-fatal issues (e.g. a ref
  // resolved to no project entry, a texture pointed at a missing
  // file). The orchestrator returns the accumulated list.
  warnings: string[];

  // ref handler: take an ext_resource (resolved from a `ExtResource(id)`
  // value) and resolve it to a target-domain key (item slug, dialog
  // sequence Id, balloon "<folder>/<basename>", etc.). Returns null
  // when no matching entry is in the ProjectIndex — handlers translate
  // null into a warning + the verbatim res:// string in JSON, matching
  // the writer's tolerance for dangling refs.
  resolveRefByExtResource: (
    ext: TresExtResource,
    targetDomain: string,
  ) => string | null;
  // texture handler: convert a Texture2D ext_resource's `res://...png`
  // path to an absolute filesystem path against `godotRoot`. Centralized
  // here so the path-mixing audit that landed in v0.2.3 stays consistent.
  resPathToAbs: (resPath: string) => string;
  // Manifest sub-resource declarations keyed by `subResource` name.
  // Used when an `array.of` or `subresource.of` field needs to know
  // the target's fields + fieldOrder + class name. Populated from the
  // loaded manifest's `subResources` array.
  subResources: Map<string, SubResource>;
}

export type FieldReader = (
  tresValue: TresValue | undefined,
  fieldDef: FieldDef,
  propName: string,
  ctx: ReaderContext,
) => unknown;

// Result returned from override readers + the generic dispatcher.
// Parallels TresWriteResult on the writer side: the caller (boot
// reconcile / watcher reimport) decides whether to write the JSON,
// flag the file as skipped, or record an error.
export interface TresReadResult {
  attempted: boolean;
  ok?: boolean;
  entity?: unknown;
  warnings?: string[];
  // Skip reason — set when the .tres didn't match the expected
  // script_class for this domain. Distinct from `error`: skips are
  // expected (one folder may carry multiple resource types), errors
  // mean parsing or mapping failed unexpectedly.
  skipReason?: string;
  error?: string;
}

export function readNotAttempted(): TresReadResult {
  return { attempted: false };
}
