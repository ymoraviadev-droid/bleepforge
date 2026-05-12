import { z } from "zod";

// Game Codex — Bleepforge-only authoring surface for project-specific concepts
// that don't fit the seven hardcoded game-domain schemas. The user defines
// their own *categories* (e.g. "Hazards", "Locations") with custom property
// schemas, then creates entries within them.
//
// On disk:
//   data/codex/<category>/_meta.json   — category schema (display name, color,
//                                         property defs)
//   data/codex/<category>/<entryId>.json — one file per entry
//
// Never round-tripped to Godot — entries live entirely in JSON. If a category
// later earns a real schema, it graduates out of the Codex into a proper
// hardcoded domain (with .tres mappers + a dedicated edit page). The Codex's
// role is the staging ground for that graduation, not a parallel production
// pipeline.

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const ID_RE = /^[a-zA-Z0-9_-]+$/;

// Same palette set the AppSearch kind-badges use — keeping the choice limited
// to a small named set means category color is theme-aware (the underlying
// Tailwind palette gets retinted by the active theme) and stable across
// theme swaps.
export const CODEX_COLORS = [
  "emerald",
  "amber",
  "red",
  "blue",
  "violet",
  "cyan",
  "orange",
  "pink",
  "lime",
] as const;
export type CodexColor = (typeof CODEX_COLORS)[number];

export const CODEX_PROPERTY_TYPES = [
  "text",
  "multiline",
  "number",
  "boolean",
  "image",
  "ref",
  "tags",
] as const;
export type CodexPropertyType = (typeof CODEX_PROPERTY_TYPES)[number];

// Domains the user can FK-reference from a Codex property. Mirrors the
// existing catalog domains; adding a new entity domain to the project (e.g.
// graduating Hazards out of Codex) means extending this list so other
// categories can refer to it.
export const CODEX_REF_DOMAINS = [
  "npc",
  "item",
  "quest",
  "faction",
  "dialog",
  "balloon",
] as const;
export type CodexRefDomain = (typeof CODEX_REF_DOMAINS)[number];

// Property values are JSON scalars or arrays of scalars. No nested objects
// in v1 — the entity-level shape stays predictable, and tag-list properties
// cover the "list of small things" case without a generic array-of-objects.
const JsonScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([JsonScalarSchema, z.array(JsonValueSchema)]),
);

export const CodexPropertyDefSchema = z.object({
  Key: z.string().regex(KEY_RE),
  Label: z.string().default(""),
  Type: z.enum(CODEX_PROPERTY_TYPES),
  // Required only when Type === "ref". Stored optional otherwise so non-ref
  // properties don't carry dead weight in JSON.
  RefDomain: z.enum(CODEX_REF_DOMAINS).optional(),
  Required: z.boolean().default(false),
  DefaultValue: JsonValueSchema.optional(),
});
export type CodexPropertyDef = z.infer<typeof CodexPropertyDefSchema>;

export const CodexCategoryMetaSchema = z.object({
  Category: z.string().regex(ID_RE),
  DisplayName: z.string().default(""),
  Color: z.enum(CODEX_COLORS).default("emerald"),
  Properties: z.array(CodexPropertyDefSchema).default([]),
  // Empty default rather than now() — first write sets it explicitly, so the
  // value reflects creation time, not parse time. A missing CreatedAt at
  // parse just means "legacy file before this field existed" (won't happen
  // in practice but the shape is forward-safe).
  CreatedAt: z.string().default(""),
});
export type CodexCategoryMeta = z.infer<typeof CodexCategoryMetaSchema>;

export const CodexEntrySchema = z.object({
  Id: z.string().regex(ID_RE),
  DisplayName: z.string().default(""),
  // Absolute filesystem path served via /api/asset. Same shape as
  // NpcData.Portrait, ItemData.Icon, etc.
  Image: z.string().default(""),
  Description: z.string().default(""),
  // Free-form documentary string ("scripts/hazards/lava.gd",
  // "world/zones/the-grove"). No validation, no Godot coupling — just a
  // label for the user's own self-reference.
  Path: z.string().default(""),
  // Property values, keyed by CodexPropertyDef.Key. Type-vs-value validation
  // is a separate pass against the matching CodexCategoryMeta — done in
  // server's writeEntry and in the client's propertyValidator/integrity.
  Properties: z.record(z.string(), JsonValueSchema).default({}),
});
export type CodexEntry = z.infer<typeof CodexEntrySchema>;

// Reserved entry ids. Without this guard the entry route /:category/:id
// would happily match /hazards/_meta and clobber the schema file with an
// entry-shaped payload. Server's storage layer rejects the name; client
// just doesn't surface it as a usable id.
export const RESERVED_ENTRY_IDS = new Set<string>(["_meta"]);

// Group shape returned by `GET /api/codex` — all categories with their meta
// and current entries in one trip. Mirrors BalloonFolderGroup / DialogFolderGroup.
export interface CodexCategoryGroup {
  category: string;
  meta: CodexCategoryMeta;
  entries: CodexEntry[];
}

// ---- Property-value validation -------------------------------------------
// Shared between server (writeEntry) and client (form validation +
// integrity check) so the rule of "what's valid for this property type"
// has one home.

export function validatePropertyValue(
  def: CodexPropertyDef,
  value: unknown,
): string | null {
  const label = def.Label || def.Key;
  const isEmpty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value === "") ||
    (Array.isArray(value) && value.length === 0);
  if (isEmpty) {
    return def.Required ? `"${label}" is required` : null;
  }
  switch (def.Type) {
    case "text":
    case "multiline":
      return typeof value === "string" ? null : `"${label}" must be text`;
    case "number":
      return typeof value === "number" && !Number.isNaN(value)
        ? null
        : `"${label}" must be a number`;
    case "boolean":
      return typeof value === "boolean" ? null : `"${label}" must be true/false`;
    case "image":
      return typeof value === "string" ? null : `"${label}" must be an image path`;
    case "ref":
      return typeof value === "string" ? null : `"${label}" must be a reference id`;
    case "tags":
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? null
        : `"${label}" must be a list of tags`;
    default:
      return null;
  }
}

export function validateEntryAgainstMeta(
  meta: CodexCategoryMeta,
  entry: CodexEntry,
): string[] {
  const errors: string[] = [];
  for (const def of meta.Properties) {
    const err = validatePropertyValue(def, entry.Properties[def.Key]);
    if (err) errors.push(err);
  }
  return errors;
}

// Default-value coercion for newly-minted entries. When the user creates
// a new entry, its Properties bag should be pre-populated with whatever
// defaults the category schema declares — gives the form sensible starting
// state without each control having to know its own default.
export function defaultPropertiesForMeta(
  meta: CodexCategoryMeta,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of meta.Properties) {
    if (def.DefaultValue !== undefined) {
      out[def.Key] = def.DefaultValue;
    } else {
      switch (def.Type) {
        case "boolean":
          out[def.Key] = false;
          break;
        case "tags":
          out[def.Key] = [];
          break;
        // text/multiline/image/ref default to empty string; number stays
        // undefined so the input renders empty rather than 0.
        case "text":
        case "multiline":
        case "image":
        case "ref":
          out[def.Key] = "";
          break;
      }
    }
  }
  return out;
}
