// subresource handler — single inline sub_resource wrapping further
// fields. NpcData.LootTable is the canonical FoB instance: LootTable
// wraps `Entries: LootEntry[]`, so it can't be modeled as a 1-element
// array (the wrapper IS the LootTable, not an item inside one).
//
// Shape: JSON value is either null (when the field is nullable +
// absent) or a Record carrying the sub-resource's user fields. The
// host property line carries `SubResource("X")` referencing a
// `[sub_resource type="Resource" id="X"]` section in the same .tres.
//
// Identity: the subresource is positional — it's THE field on the
// host. We don't track _subId at this level (unlike array entries
// which have N items needing stable identity). Reuse-vs-mint decision:
// if the host property line already points at an existing sub_resource
// section, reconcile in place; else mint a new section.
//
// Teardown: removing the subresource also removes any nested
// sub_resources it references (depth-recursive). FoB's LootTable
// references LootEntry sub_resources via its Entries array; deleting
// the LootTable without cleaning up the LootEntries would leave dead
// sections.

import {
  buildSubResourceSection,
  findSubResourceById,
  insertSectionBefore,
  mintSubResourceId,
  reconcileProperty,
  removeSectionById,
  serializeString,
} from "../../mutate.js";
import type { Doc, Section } from "../../types.js";
import { findOrAddExtResource } from "../extResources.js";
import { applyFlatFields } from "../orchestrator.js";
import type { WriterContext } from "../types.js";
import type { FieldDef } from "@bleepforge/shared";

export function applySubresourceField(
  section: Section,
  fieldOrder: readonly string[],
  propName: string,
  fieldDef: Extract<FieldDef, { type: "subresource" }>,
  jsonValue: unknown,
  ctx: WriterContext,
): void {
  if (fieldDef.type !== "subresource") {
    throw new Error(`applySubresourceField: unsupported type "${fieldDef.type}"`);
  }
  const subResource = ctx.subResources.get(fieldDef.of);
  if (!subResource) {
    ctx.warnings.push(
      `subresource ${propName}: sub-resource "${fieldDef.of}" not in manifest — line left unchanged`,
    );
    return;
  }

  // Identify the existing sub_resource section (if any) by parsing the
  // host property's raw value for `SubResource("id")`.
  const existingRaw = readExistingRawValue(section, propName);
  const existingSubId = existingRaw
    ? existingRaw.match(/^SubResource\("([^"]+)"\)/)?.[1] ?? null
    : null;
  const existingSection = existingSubId
    ? findSubResourceById(ctx.doc, existingSubId)
    : null;

  // Case A: JSON null / absent → tear down.
  const isAbsent =
    jsonValue === null ||
    jsonValue === undefined ||
    (typeof jsonValue === "object" && Object.keys(jsonValue as object).length === 0);
  if (isAbsent) {
    if (existingSection && existingSubId) {
      // Recursive cleanup: walk the body for any SubResource refs and
      // remove those sections too. Otherwise removing a LootTable that
      // had Entries would leave the LootEntry sub_resources orphaned.
      removeNestedSubResources(ctx.doc, existingSection);
      removeSectionById(ctx.doc, "sub_resource", existingSubId);
    }
    reconcileProperty(section, propName, null, fieldOrder);
    return;
  }

  if (typeof jsonValue !== "object" || Array.isArray(jsonValue)) {
    ctx.warnings.push(
      `subresource ${propName}: expected object, got ${typeof jsonValue} — line left unchanged`,
    );
    return;
  }
  const entry = jsonValue as Record<string, unknown>;

  // Resolve the underlying C# script for this sub-resource.
  const script = ctx.resolveScriptByClassName(subResource.class);
  if (!script || !script.uid) {
    ctx.warnings.push(
      `subresource ${propName}: no script UID for class "${subResource.class}" — line left unchanged`,
    );
    return;
  }
  const scriptExt = findOrAddExtResource(ctx.doc, {
    type: "Script",
    uid: script.uid,
    path: script.resPath,
  });

  const fullFieldOrder: readonly string[] = [
    "script",
    ...subResource.fieldOrder,
    "metadata/_custom_type_script",
  ];

  if (existingSection) {
    // Case C: existing → reconcile user fields in place. The property
    // line already references the correct SubResource id; no update.
    applyFlatFields(existingSection, subResource.fields, fullFieldOrder, entry, ctx);
    return;
  }

  // Case B: no existing section → mint a fresh one and update the line.
  const newId = mintSubResourceId(ctx.doc);
  const newSection = buildSubResourceSection({
    type: "Resource",
    id: newId,
    properties: [
      { key: "script", rawValue: `ExtResource("${scriptExt.id}")` },
      {
        key: "metadata/_custom_type_script",
        rawValue: serializeString(script.uid),
      },
    ],
  });
  applyFlatFields(newSection, subResource.fields, fullFieldOrder, entry, ctx);
  insertSectionBefore(ctx.doc, "resource", newSection);
  reconcileProperty(section, propName, `SubResource("${newId}")`, fieldOrder);
}

// ---- Helpers --------------------------------------------------------------

function readExistingRawValue(section: Section, key: string): string | null {
  const entry = section.body.find(
    (e) => e.kind === "property" && e.key === key,
  );
  if (!entry || entry.kind !== "property") return null;
  return entry.rawAfterEquals.trim();
}

// Walks `section.body` for any SubResource("X") refs in property
// values, recursively removes those sections (and their nested
// children). Used when a subresource field tears down its wrapper —
// the wrapper's array/single-subresource fields may reference further
// sub_resources that would otherwise be orphaned.
function removeNestedSubResources(doc: Doc, section: Section): void {
  const re = /SubResource\("([^"]+)"\)/g;
  const ids = new Set<string>();
  for (const e of section.body) {
    if (e.kind !== "property") continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(e.rawAfterEquals)) !== null) {
      ids.add(m[1]!);
    }
  }
  for (const id of ids) {
    const sub = findSubResourceById(doc, id);
    if (sub) removeNestedSubResources(doc, sub);
    removeSectionById(doc, "sub_resource", id);
  }
}
