import { z } from "zod";

// Bleepforge manifest — the v0.2.6 contract between the godot-lib emitter
// (running inside the user's Godot project) and the Bleepforge editor that
// consumes it. The library reflects over the user's `BleepforgeResource`
// subclasses, builds a manifest matching this schema, and writes
// `bleepforge_manifest.json` at the Godot project root. The editor parses
// it via this same schema and uses it to drive generic list/edit/writeback
// surfaces (v0.2.7+).
//
// Authority: the spec was locked 2026-05-16 in the v-0-2-6-spec memory.
// Phase 0's audit (the FoB schema + per-domain mapper walk) confirmed the
// 11-type catalog covers every authored field in FoB but surfaced TWO
// minimal expansions over the locked spec, codified here:
//
//   1. `subresource` — a 12th field type for a single inline sub-resource
//      (NpcData.LootTable is the only FoB instance). The locked 11-type
//      catalog had only `array` for sub-resource collections, with no way
//      to express a single nullable inline sub-resource. Adding the type
//      is more honest than forcing LootTable into a 1-element array.
//
//   2. `array.itemRef` — arrays can hold either sub-resources (`of: "X"`)
//      OR refs to another domain (`itemRef: { to: "Y" }`). NpcData
//      .CasualRemarks is the FoB instance: an array of references to
//      Balloons. The locked spec only documented sub-resource arrays.
//
// Both expansions were called out at locked-decision time and accepted as
// "things the audit may surface." Sub-resource fields and ref-arrays are
// load-bearing for FoB's NPC schema, so leaving them out would force a
// known limit in v0.2.7's generic mapper.
//
// Five other locked decisions from the same Phase 0 conversation are baked
// in below:
//
//   - `showWhen` gates BOTH UI render AND writeback. Hidden fields are
//     omitted from .tres output. Cleaner files; matches what the user
//     sees.
//   - `array.arrayContainerType` field-level flag picks between Godot's
//     plain `[...]` and C#-typed `Array[ExtResource("...")]([...])`
//     forms. Default `untyped`. Defensive: getting NPC LootTable wrong
//     here silently breaks loot.
//   - Per-entry `fieldOrder` is declared explicitly. The alternative —
//     reading order from existing files — silently breaks on first save
//     of a new entity.
//   - Composite-id refs (foldered domains have `<folder>/<basename>` ids)
//     are documented behavior, not a new schema field. The editor knows
//     the id shape from the target domain's `kind`.
//   - `subresource.nullable: true` for inline sub-resources that may be
//     missing entirely (NpcData.LootTable).
//
// What's intentionally NOT in this schema (deferred):
//
//   - Reference-resolution callbacks (resolveTextureUid, resolveDialogRef,
//     etc). Runtime concern — the v0.2.7 generic mapper defines callback
//     contracts per field type. Manifest just declares "this is a ref."
//   - AtlasTexture preservation on empty texture writeback. Generic-mapper
//     behavior, documented as a known invariant.
//   - Multiline string parsing, float ".0" formatting, orphan ext-resource
//     cleanup, script UID resolution per sub-resource class. All
//     pipeline-layer behaviors.
//   - Legacy migrations (NPC CasualRemark singular → plural). One-off, not
//     manifest-level.
//   - Enum-value editability (v0.2.8 — see project_v0_2_8_enum_editability
//     memory). v0.2.6 enums are always read-only (reflected from C#).

// ---------------------------------------------------------------------------
// Field types (12) — discriminated by `type`. Adding a 13th field type
// expands this union; the discriminated-union shape forces every consumer
// to handle the new variant explicitly.
// ---------------------------------------------------------------------------

// `showWhen` — sibling-field-value predicate. Maps a sibling field name to
// either a single value or a list of values; the field is "applicable"
// when the sibling's current value matches. Used both to gate UI rendering
// (form hides the field) AND writeback (mapper omits the field from .tres
// output). Same primitive, dual-purpose.
//
// Example: Quest Objective's TargetItem applies only when Type=CollectItem;
// declared as `showWhen: { Type: "CollectItem" }`.
const ShowWhenValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);
export type ShowWhenValue = z.infer<typeof ShowWhenValueSchema>;
export const ShowWhenSchema = z.record(z.string(), ShowWhenValueSchema);
export type ShowWhen = z.infer<typeof ShowWhenSchema>;

const StringFieldSchema = z.object({
  type: z.literal("string"),
  required: z.boolean().default(false),
  default: z.string().optional(),
  showWhen: ShowWhenSchema.optional(),
});

const MultilineFieldSchema = z.object({
  type: z.literal("multiline"),
  required: z.boolean().default(false),
  default: z.string().optional(),
  showWhen: ShowWhenSchema.optional(),
});

const IntFieldSchema = z.object({
  type: z.literal("int"),
  required: z.boolean().default(false),
  default: z.number().int().optional(),
  showWhen: ShowWhenSchema.optional(),
});

const FloatFieldSchema = z.object({
  type: z.literal("float"),
  required: z.boolean().default(false),
  default: z.number().optional(),
  showWhen: ShowWhenSchema.optional(),
});

const BoolFieldSchema = z.object({
  type: z.literal("bool"),
  required: z.boolean().default(false),
  default: z.boolean().optional(),
  showWhen: ShowWhenSchema.optional(),
});

// Enum values are declared inline as strings. The library's emit converts
// the user's C# enum to its string-name form (FoB's Faction enum int values
// become "Scavengers" / "FreeRobots" / "RFF" / "Grove"). v0.2.8 will add a
// `valuesEditable` flag for Bleepforge-authored enums; for v0.2.6 every
// enum is C#-fixed.
const EnumFieldSchema = z.object({
  type: z.literal("enum"),
  values: z.array(z.string()).min(1),
  required: z.boolean().default(false),
  default: z.string().optional(),
  showWhen: ShowWhenSchema.optional(),
});

// Free-form game-flag string. Editor surfaces autocomplete from the corpus
// of existing flag values across all domains. No declaration of valid
// values — that's the point of flags vs. enums.
const FlagFieldSchema = z.object({
  type: z.literal("flag"),
  required: z.boolean().default(false),
  default: z.string().optional(),
  showWhen: ShowWhenSchema.optional(),
});

// Cross-domain reference. `to` names a domain in the manifest; the editor
// renders an autocomplete picker against that domain's entries. The id
// shape (plain id vs `<folder>/<basename>` composite for foldered domains)
// is derived from the target domain's `kind` — composite-id refs are NOT
// a separate schema concern.
const RefFieldSchema = z.object({
  type: z.literal("ref"),
  to: z.string(),
  required: z.boolean().default(false),
  default: z.string().optional(),
  showWhen: ShowWhenSchema.optional(),
});

// Array field — holds either sub-resources or refs.
//
//   - `of: "<sub-resource-name>"` (omits `itemRef`) → array of inline
//     sub-resources. Most FoB arrays use this form (DialogSequence.Lines,
//     KarmaImpact.Deltas, Quest.Objectives, NpcData.Quests, etc).
//
//   - `itemRef: { to: "<domain>" }` (omits `of`) → array of refs.
//     NpcData.CasualRemarks is the only FoB instance.
//
// `arrayContainerType: "typed"` emits the C# typed-collection literal
// `Array[ExtResource("scriptId")]([...])` instead of plain `[...]`.
// Required for any field declared in C# as `Godot.Collections.Array<T>`.
// Default `untyped`.
//
// `nullable: true` allows the field to be omitted entirely from .tres
// (vs. emitting an empty `[]`).
// Refinement (`of` XOR `itemRef`) lives on the outer FieldDefSchema below
// because zod's `discriminatedUnion` rejects ZodEffects variants.
const ArrayFieldSchema = z.object({
  type: z.literal("array"),
  of: z.string().optional(),
  itemRef: z.object({ to: z.string() }).optional(),
  arrayContainerType: z.enum(["typed", "untyped"]).default("untyped"),
  nullable: z.boolean().default(false),
  required: z.boolean().default(false),
  showWhen: ShowWhenSchema.optional(),
});

// Single inline sub-resource. The 12th field type, beyond the locked spec.
// Necessary for NpcData.LootTable — the LootTable wraps an Entries array,
// so it can't itself be an array. `nullable: true` lets the wrapper be
// absent entirely (NPCs with no loot drop nothing).
const SubresourceFieldSchema = z.object({
  type: z.literal("subresource"),
  of: z.string(),
  nullable: z.boolean().default(false),
  required: z.boolean().default(false),
  showWhen: ShowWhenSchema.optional(),
});

// Texture2D-shaped field. JSON holds an absolute filesystem path (resolved
// from `res://` at import); the .tres holds an ext-resource reference. The
// generic mapper preserves any existing AtlasTexture sub-resource when the
// JSON value is empty (see Phase 0 audit, AtlasTexture preservation).
const TextureFieldSchema = z.object({
  type: z.literal("texture"),
  required: z.boolean().default(false),
  default: z.string().optional(),
  showWhen: ShowWhenSchema.optional(),
});

// PackedScene-shaped field. JSON holds an absolute path to a `.tscn`; the
// .tres holds an ext-resource reference. NpcData LootEntry.PickupScene is
// the only FoB instance.
const SceneFieldSchema = z.object({
  type: z.literal("scene"),
  required: z.boolean().default(false),
  default: z.string().optional(),
  showWhen: ShowWhenSchema.optional(),
});

const FieldDefDiscriminatedSchema = z.discriminatedUnion("type", [
  StringFieldSchema,
  MultilineFieldSchema,
  IntFieldSchema,
  FloatFieldSchema,
  BoolFieldSchema,
  EnumFieldSchema,
  FlagFieldSchema,
  RefFieldSchema,
  ArrayFieldSchema,
  SubresourceFieldSchema,
  TextureFieldSchema,
  SceneFieldSchema,
]);

// `array` fields must specify exactly one of `of` (sub-resource name) or
// `itemRef` (cross-domain ref). Refinement lives here on the outer schema
// because discriminatedUnion variants must be raw ZodObjects.
export const FieldDefSchema = FieldDefDiscriminatedSchema.superRefine(
  (data, ctx) => {
    if (data.type === "array" && Boolean(data.of) === Boolean(data.itemRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "array field must specify exactly one of `of` (sub-resource name) or `itemRef` (cross-domain reference)",
      });
    }
  },
);
export type FieldDef = z.infer<typeof FieldDefSchema>;

export const FIELD_TYPES = [
  "string",
  "multiline",
  "int",
  "float",
  "bool",
  "enum",
  "flag",
  "ref",
  "array",
  "subresource",
  "texture",
  "scene",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// `FieldsRecord` references the raw discriminated union (NOT the
// `.superRefine()`-wrapped FieldDefSchema) because z.record needs a
// ZodObject-like value type, and the entry schemas need to be raw
// ZodObjects to feed into their own discriminatedUnion. The array-field
// refinement runs at the manifest level via the top-level superRefine
// on ManifestSchema below — covers every field in every entry once.
const FieldsRecordSchema = z.record(z.string(), FieldDefDiscriminatedSchema);
export type FieldsRecord = z.infer<typeof FieldsRecordSchema>;

// ---------------------------------------------------------------------------
// Cross-cutting hooks shared by all entry kinds.
// ---------------------------------------------------------------------------

// `view` — the editor's default surface for this domain. Defaults to "list".
// "graph" requires at least one `ref` field on the entity (or the renderer
// has no edges to draw). "cards" is the visual-rich variant of list.
export const VIEW_KINDS = ["list", "cards", "graph"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

// `overrideUi` — name of a registered React component the editor should
// mount instead of the generic surface. Declared in the manifest, consumed
// in v0.2.7+. v0.2.6 records the names but doesn't act on them; FoB's
// existing bespoke UIs (DialogGraph, NpcEdit, etc) plug in via this.
const OverrideUiSchema = z.string().nullable().default(null);

const CommonEntryProps = {
  view: z.enum(VIEW_KINDS).default("list"),
  overrideUi: OverrideUiSchema,
} as const;

// ---------------------------------------------------------------------------
// Four entry kinds — discriminated by `kind`.
// ---------------------------------------------------------------------------

// (1) `kind: "domain"` — single instance per file, flat shape. Quest, Karma,
// NPC. Files live directly under `folder`.
const DomainEntrySchema = z.object({
  domain: z.string(),
  kind: z.literal("domain"),
  class: z.string(),
  // Field name within `fields` whose value is the entity's identity (e.g.
  // "Id" for Quest, "NpcId" for NpcData, "Slug" for ItemData).
  key: z.string(),
  // Optional: which field's value to surface as the human-readable label.
  // Falls back to `key` when omitted.
  displayName: z.string().optional(),
  folder: z.string(),
  fields: FieldsRecordSchema,
  // Field-emit order. Must contain exactly the keys in `fields` (validated
  // at parse via the top-level ManifestSchema superRefine). Explicit
  // declaration vs. file-inferred order is the locked decision — file
  // inference silently breaks on first-save of a new entity.
  fieldOrder: z.array(z.string()),
  ...CommonEntryProps,
});

// (2) `kind: "discriminatedFamily"` — one base class with N variants keyed
// by an enum field on the base. The base's discriminator field's enum
// values map to variant entries. ItemData / QuestItemData is the FoB
// instance.
const VariantSchema = z.object({
  // The discriminator field value that selects this variant.
  value: z.string(),
  class: z.string(),
  // Fields ADDED on top of the base (never replacing). Empty when the
  // variant just constrains base values.
  extraFields: FieldsRecordSchema.default({}),
  // Order of the extra fields, appended to the base's fieldOrder when
  // emitting the .tres for this variant.
  extraFieldOrder: z.array(z.string()).default([]),
});
export type Variant = z.infer<typeof VariantSchema>;

const DiscriminatedFamilyEntrySchema = z.object({
  domain: z.string(),
  kind: z.literal("discriminatedFamily"),
  // Field name on `base` whose value picks the variant. Must be an enum
  // field; the variants' `value` strings must be in its `values` list. (Not
  // refinement-validated to keep error surfaces simple — the v0.2.7 mapper
  // surfaces a clearer error at usage time.)
  discriminator: z.string(),
  key: z.string(),
  displayName: z.string().optional(),
  folder: z.string(),
  base: z.object({
    class: z.string(),
    fields: FieldsRecordSchema,
    fieldOrder: z.array(z.string()),
  }),
  variants: z.array(VariantSchema),
  ...CommonEntryProps,
});

// (3) `kind: "foldered"` — per-folder grouping discovered by walking the
// project tree. Dialog (folder = parent dir = speaker), Balloon (folder =
// grandparent dir = robot model). Composite ids `<folder>/<basename>`.
const FolderDiscoverySchema = z.object({
  // Only "walk" today — the library walks the project tree at manifest
  // emit time, indexing every file matching `class`. Future modes (e.g.
  // "registered") could be added here.
  mode: z.literal("walk"),
  // Which dir level becomes the "folder" portion of the entity's id.
  // Dialog: parent dir basename ("Eddie"). Balloon: grandparent dir
  // basename (the NPC model — immediate parent must be named "balloons",
  // see `parentNameMustBe`).
  groupBy: z.enum(["parentDir", "grandparentDir"]),
  // Defensive convention check. When set, the file's immediate parent dir
  // must be named exactly this string for the file to be picked up. Used
  // by Balloon ("balloons") so a stray BalloonLine .tres elsewhere in the
  // project doesn't get misclassified.
  parentNameMustBe: z.string().nullable().default(null),
});

const FolderedEntrySchema = z.object({
  domain: z.string(),
  kind: z.literal("foldered"),
  class: z.string(),
  key: z.string(),
  displayName: z.string().optional(),
  folderDiscovery: FolderDiscoverySchema,
  fields: FieldsRecordSchema,
  fieldOrder: z.array(z.string()),
  ...CommonEntryProps,
});

// (4) `kind: "enumKeyed"` — exactly one instance per enum value. Faction is
// the FoB instance. Layout determines whether each value gets a subfolder
// (current FoB convention) or a single file named by the value.
const EnumKeyedEntrySchema = z.object({
  domain: z.string(),
  kind: z.literal("enumKeyed"),
  class: z.string(),
  // The field name holding the enum value. The field's type MUST be
  // `enum` and its values MUST match `enumValues` here. (Same soft-check
  // policy as discriminator.)
  key: z.string(),
  enumValues: z.array(z.string()).min(1),
  displayName: z.string().optional(),
  folder: z.string(),
  // "subfolderPerValue": <folder>/<value>/<value>.tres (FoB Faction).
  // "fileNamedByValue": <folder>/<value>.tres (simpler, no per-value
  // grouping for sibling assets).
  folderLayout: z
    .enum(["subfolderPerValue", "fileNamedByValue"])
    .default("subfolderPerValue"),
  fields: FieldsRecordSchema,
  fieldOrder: z.array(z.string()),
  ...CommonEntryProps,
});

export const EntrySchema = z.discriminatedUnion("kind", [
  DomainEntrySchema,
  DiscriminatedFamilyEntrySchema,
  FolderedEntrySchema,
  EnumKeyedEntrySchema,
]);
export type Entry = z.infer<typeof EntrySchema>;

export const ENTRY_KINDS = [
  "domain",
  "discriminatedFamily",
  "foldered",
  "enumKeyed",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

// ---------------------------------------------------------------------------
// Sub-resource declarations — referenced by `array.of` or `subresource.of`.
// ---------------------------------------------------------------------------

// `stableIdField` mirrors Bleepforge's existing `_subId` mechanism for
// reorder-safe sub-resource matching across save round-trips. The library
// reflects this from the C# class — fields decorated with the marker
// attribute become the stable id. Default `_subId` matches existing FoB
// JSON.
export const SubResourceSchema = z.object({
  // Unique name within the manifest, used by `array.of` / `subresource.of`
  // references. Conventionally matches `class` but doesn't have to.
  subResource: z.string(),
  class: z.string(),
  stableIdField: z.string().default("_subId"),
  fields: FieldsRecordSchema,
  fieldOrder: z.array(z.string()),
});
export type SubResource = z.infer<typeof SubResourceSchema>;

// ---------------------------------------------------------------------------
// Top-level manifest shape.
// ---------------------------------------------------------------------------

// All `fieldOrder` checks consolidate at the top level so the inner
// schemas stay raw ZodObjects (required by both discriminatedUnion and
// z.record for the FieldsRecordSchema feeding into entries). Catches
// manifest-emitter bugs at parse: a fieldOrder missing a key would
// silently drop that field from .tres output, and an extra key would
// fail at writeback time with a confusing "no such field" error. Both
// surface as clear messages here instead.
export const ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    domains: z.array(EntrySchema),
    subResources: z.array(SubResourceSchema),
  })
  .superRefine((data, ctx) => {
    // Validate fieldOrder for every entry across all four kinds.
    for (let i = 0; i < data.domains.length; i++) {
      const entry = data.domains[i]!;
      const path = ["domains", i];

      switch (entry.kind) {
        case "domain":
        case "foldered":
        case "enumKeyed": {
          const msg = fieldOrderMismatchMessage(entry.fields, entry.fieldOrder);
          if (msg) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...path, "fieldOrder"],
              message: msg,
            });
          }
          break;
        }
        case "discriminatedFamily": {
          const baseMsg = fieldOrderMismatchMessage(
            entry.base.fields,
            entry.base.fieldOrder,
          );
          if (baseMsg) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...path, "base", "fieldOrder"],
              message: baseMsg,
            });
          }
          for (let v = 0; v < entry.variants.length; v++) {
            const variant = entry.variants[v]!;
            const variantMsg = fieldOrderMismatchMessage(
              variant.extraFields,
              variant.extraFieldOrder,
            );
            if (variantMsg) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [...path, "variants", v, "extraFieldOrder"],
                message: variantMsg,
              });
            }
          }
          break;
        }
      }
    }

    // Validate fieldOrder for every sub-resource.
    for (let i = 0; i < data.subResources.length; i++) {
      const sub = data.subResources[i]!;
      const msg = fieldOrderMismatchMessage(sub.fields, sub.fieldOrder);
      if (msg) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subResources", i, "fieldOrder"],
          message: msg,
        });
      }
    }
  });
export type Manifest = z.infer<typeof ManifestSchema>;

export const MANIFEST_FILENAME = "bleepforge_manifest.json";
export const MANIFEST_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Refinement helper — returns null when fieldOrder matches fields keys
// exactly, otherwise an error message. Used by ManifestSchema's top-level
// superRefine for every entry + sub-resource declaration. Catching at
// parse means malformed manifests fail loudly instead of producing subtly
// wrong .tres files at writeback time.
// ---------------------------------------------------------------------------

function fieldOrderMismatchMessage(
  fields: FieldsRecord,
  fieldOrder: string[],
): string | null {
  const fieldKeys = new Set(Object.keys(fields));
  const orderSet = new Set(fieldOrder);
  const missing = [...fieldKeys].filter((k) => !orderSet.has(k));
  const extra = [...orderSet].filter((k) => !fieldKeys.has(k));
  if (missing.length === 0 && extra.length === 0) return null;
  const parts: string[] = [];
  if (missing.length) parts.push(`missing from fieldOrder: ${missing.join(", ")}`);
  if (extra.length) parts.push(`unknown in fieldOrder: ${extra.join(", ")}`);
  return `fieldOrder must match fields keys exactly (${parts.join("; ")})`;
}
