// array handler — sub-resource arrays AND cross-domain ref arrays.
//
// The single meatiest piece of the generic mapper. Two shapes,
// distinguished by which property the manifest sets:
//
//   - `array.of: "SubResourceName"` → array of inline sub-resources.
//     Each entry creates a `[sub_resource type="Resource" id="..."]`
//     section with `script = ExtResource(...)`, user fields, and
//     `metadata/_custom_type_script`. Stable identity via `_subId`
//     (matches the existing FoB convention) so reorder + add + update
//     + remove all work without churn.
//
//   - `array.itemRef: { to: "domain" }` → array of refs to other
//     authored Resources. Each entry mints/dedups a Resource-typed
//     ext_resource via the same path the ref handler uses.
//
// Typed vs untyped container:
//   Sub-resource arrays, typed:  `Array[ExtResource("<scriptId>")]([SubResource(...), ...])`
//   Sub-resource arrays, untyped: `[SubResource(...), ...]`
//   Ref arrays,         typed:  `Array[Object]([ExtResource(...), ...])`
//   Ref arrays,         untyped: `[ExtResource(...), ...]`
//
// Empty arrays drop the property line entirely, matching FoB's
// existing writer behavior (`reconcileSubResourceArray` returns null
// as the raw value for an empty list).

import {
  buildSubResourceSection,
  reconcileProperty,
  reconcileSubResourceArray,
  serializeString,
  serializeSubRefArray,
} from "../../mutate.js";
import type { Section } from "../../types.js";
import { findOrAddExtResource } from "../extResources.js";
import { applyFlatFields } from "../orchestrator.js";
import type { WriterContext } from "../types.js";
import type { FieldDef } from "@bleepforge/shared";

export function applyArrayField(
  section: Section,
  fieldOrder: readonly string[],
  propName: string,
  fieldDef: FieldDef,
  jsonValue: unknown,
  ctx: WriterContext,
): void {
  if (fieldDef.type !== "array") {
    throw new Error(`applyArrayField: unsupported field type "${fieldDef.type}"`);
  }
  if (fieldDef.of && fieldDef.itemRef) {
    ctx.warnings.push(
      `array ${propName}: both 'of' and 'itemRef' set (manifest XOR violated) — line left unchanged`,
    );
    return;
  }
  if (fieldDef.of) {
    applySubResourceArray(section, fieldOrder, propName, fieldDef, jsonValue, ctx);
    return;
  }
  if (fieldDef.itemRef) {
    applyRefArray(section, fieldOrder, propName, fieldDef, jsonValue, ctx);
    return;
  }
  ctx.warnings.push(
    `array ${propName}: neither 'of' nor 'itemRef' set — line left unchanged`,
  );
}

// ---- Sub-resource arrays ---------------------------------------------------

function applySubResourceArray(
  section: Section,
  fieldOrder: readonly string[],
  propName: string,
  fieldDef: Extract<FieldDef, { type: "array" }>,
  jsonValue: unknown,
  ctx: WriterContext,
): void {
  const subResourceName = fieldDef.of!;
  const subResource = ctx.subResources.get(subResourceName);
  if (!subResource) {
    ctx.warnings.push(
      `array ${propName}: sub-resource "${subResourceName}" not in manifest — line left unchanged`,
    );
    return;
  }

  const entries = coerceArray(jsonValue, propName) as Array<
    Record<string, unknown> & { _subId?: string }
  >;

  // Resolve the underlying script for this sub-resource's class. The
  // script ext_resource may already exist in the .tres (common case
  // when reconciling an existing array) or may need minting (first
  // time this sub-resource type appears in the file). Skipped entirely
  // when the array is empty — the script ref is only needed for
  // buildNew, and an empty array hits the remove-all path.
  let scriptExtId: string | null = null;
  if (entries.length > 0) {
    const script = ctx.resolveScriptByClassName(subResource.class);
    if (!script || !script.uid) {
      ctx.warnings.push(
        `array ${propName}: no script UID for class "${subResource.class}" — line left unchanged`,
      );
      return;
    }
    const found = findOrAddExtResource(ctx.doc, {
      type: "Script",
      uid: script.uid,
      path: script.resPath,
    });
    scriptExtId = found.id;
  }

  // Field order for each sub_resource section combines the conventional
  // wrapper lines (script first, metadata last) with the user-authored
  // fields from the manifest's sub-resource declaration.
  const subFieldOrder: readonly string[] = [
    "script",
    ...subResource.fieldOrder,
    "metadata/_custom_type_script",
  ];

  reconcileSubResourceArray(
    ctx.doc,
    section,
    propName,
    fieldOrder,
    entries,
    {
      reconcileExisting: (subSection, entry) => {
        applyFlatFields(
          subSection,
          subResource.fields,
          subFieldOrder,
          entry as Record<string, unknown>,
          ctx,
        );
        // FoB writers return per-property action info for downstream
        // logging; the generic mapper's caller (writeTres) doesn't
        // surface it today, so an empty list is fine.
        return [];
      },
      buildNew: (entry, subId) => {
        if (!scriptExtId) {
          // Belt-and-braces: we only mint when entries.length > 0, and
          // we returned early above if the script couldn't resolve.
          return null;
        }
        return buildNewSubResource(
          subId,
          scriptExtId,
          ctx.resolveScriptByClassName(subResource.class)!.uid,
          entry as Record<string, unknown>,
          subResource.fields,
          subFieldOrder,
          ctx,
        );
      },
      insertBefore: "resource",
      ...(fieldDef.arrayContainerType === "typed" && scriptExtId
        ? { typedArrayExtId: scriptExtId }
        : {}),
    },
  );
}

// Constructs a fresh sub_resource section.  Wraps the standard
// script + metadata trailer around an applyFlatFields call so the user
// fields land in their declared positions.
function buildNewSubResource(
  subId: string,
  scriptExtId: string,
  scriptUid: string,
  entry: Record<string, unknown>,
  fields: Parameters<typeof applyFlatFields>[1],
  fieldOrder: readonly string[],
  ctx: WriterContext,
): Section {
  const section = buildSubResourceSection({
    type: "Resource",
    id: subId,
    properties: [
      { key: "script", rawValue: `ExtResource("${scriptExtId}")` },
      {
        key: "metadata/_custom_type_script",
        rawValue: serializeString(scriptUid),
      },
    ],
  });
  // applyFlatFields runs reconcileProperty for each user field. Since
  // the section already has script + metadata, every user field gets
  // inserted between them by insertPropertyOrdered (which respects
  // fieldOrder and places before the first higher-ordered existing
  // property — metadata, in this case).
  applyFlatFields(section, fields, fieldOrder, entry, ctx);
  return section;
}

// ---- Ref arrays -----------------------------------------------------------

function applyRefArray(
  section: Section,
  fieldOrder: readonly string[],
  propName: string,
  fieldDef: Extract<FieldDef, { type: "array" }>,
  jsonValue: unknown,
  ctx: WriterContext,
): void {
  const targetDomain = fieldDef.itemRef!.to;
  const keys = coerceArray(jsonValue, propName) as unknown[];

  const extIds: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (typeof key !== "string" || key === "") {
      ctx.warnings.push(
        `array ${propName}[${i}]: non-string or empty ref — skipped`,
      );
      continue;
    }
    const resolved = ctx.resolveRef(targetDomain, key);
    if (!resolved) {
      ctx.warnings.push(
        `array ${propName}[${i}]: no .tres for ${targetDomain} "${key}" — skipped`,
      );
      continue;
    }
    const found = findOrAddExtResource(ctx.doc, {
      type: "Resource",
      uid: resolved.uid,
      path: resolved.resPath,
    });
    extIds.push(found.id);
  }

  if (extIds.length === 0) {
    // Empty → drop the line (FoB convention; nullable doesn't change
    // this in practice since nothing depends on the difference).
    reconcileProperty(section, propName, null, fieldOrder);
    return;
  }

  const rawValue = serializeRefArray(extIds, fieldDef.arrayContainerType);
  reconcileProperty(section, propName, rawValue, fieldOrder);
}

// Ref arrays use `Array[Object]([...])` for the typed form, NOT the
// target class's script ext_resource. Confirmed against FoB's
// NpcData.CasualRemarks files. Untyped is bare `[ExtResource(...), ...]`.
function serializeRefArray(
  extIds: string[],
  arrayContainerType: "typed" | "untyped",
): string {
  const items = extIds.map((id) => `ExtResource("${id}")`).join(", ");
  const bare = `[${items}]`;
  return arrayContainerType === "typed" ? `Array[Object](${bare})` : bare;
}

// `serializeSubRefArray` already does the equivalent for sub_resource
// arrays via reconcileSubResourceArray's typedArrayExtId. Re-exported
// here only because the smoke test needs to spot-check its output.
export { serializeSubRefArray };

// ---- Helpers --------------------------------------------------------------

function coerceArray(jsonValue: unknown, propName: string): unknown[] {
  if (jsonValue === undefined || jsonValue === null) return [];
  if (Array.isArray(jsonValue)) return jsonValue;
  throw new Error(`array ${propName}: expected array, got ${typeof jsonValue}`);
}
