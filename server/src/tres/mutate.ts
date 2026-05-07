import type { BodyEntry, Doc, Section, SectionKind } from "./types.js";

// ---- Property mutation -----------------------------------------------------

// Replaces one property's rawLine in a section. The new value is the *raw*
// text that appears after `= ` (e.g. for a string property pass the quoted
// form `"R.F.F Keycard"`). Line ending is preserved from the existing entry.
//
// Returns true if the property was found and updated, false otherwise.
export function setPropertyRaw(section: Section, key: string, newRawValue: string): boolean {
  const idx = section.body.findIndex((e) => e.kind === "property" && e.key === key);
  if (idx < 0) return false;
  const existing = section.body[idx]! as Extract<BodyEntry, { kind: "property" }>;
  const eol = detectEol(existing.rawLine);
  section.body[idx] = makePropertyEntry(key, newRawValue, eol);
  return true;
}

// Removes a property line from a section. Returns true if removed.
export function removePropertyByKey(section: Section, key: string): boolean {
  const idx = section.body.findIndex((e) => e.kind === "property" && e.key === key);
  if (idx < 0) return false;
  section.body.splice(idx, 1);
  return true;
}

// Inserts a property line at the position dictated by `fieldOrder`. The new
// line is placed before the first existing property whose declared order is
// greater than the new key's order. If none exist, the new line is appended
// after the last property (and before any trailing non-property entries).
//
// Throws if the key isn't in fieldOrder. Returns true on insert; false if
// the property already exists (caller should use setPropertyRaw instead).
export function insertPropertyOrdered(
  section: Section,
  key: string,
  rawValue: string,
  fieldOrder: readonly string[],
): boolean {
  const existingIdx = section.body.findIndex((e) => e.kind === "property" && e.key === key);
  if (existingIdx >= 0) return false;

  const newOrder = fieldOrder.indexOf(key);
  if (newOrder < 0) {
    throw new Error(`insertPropertyOrdered: "${key}" not in fieldOrder`);
  }

  const eol = inferSectionEol(section);
  const entry = makePropertyEntry(key, rawValue, eol);

  // Insert before the first existing property whose order is greater.
  for (let i = 0; i < section.body.length; i++) {
    const e = section.body[i]!;
    if (e.kind !== "property") continue;
    const ord = fieldOrder.indexOf(e.key);
    if (ord > newOrder) {
      section.body.splice(i, 0, entry);
      return true;
    }
  }

  // Otherwise append after the last property entry (before any trailing
  // blank/opaque entries — though these are uncommon since the parser
  // assigns trailing blanks to the *next* section's preamble territory).
  let insertAt = section.body.length;
  for (let i = section.body.length - 1; i >= 0; i--) {
    if (section.body[i]!.kind === "property") {
      insertAt = i + 1;
      break;
    }
  }
  section.body.splice(insertAt, 0, entry);
  return true;
}

// Convenience: ensures a property's state matches the desired value.
//   - If rawValue is null  → property line should NOT exist (remove if present).
//   - If rawValue is set   → property line should exist with that value
//                            (update if present, insert if not).
// Returns the action taken: "updated" | "inserted" | "removed" | "noop".
export function reconcileProperty(
  section: Section,
  key: string,
  rawValue: string | null,
  fieldOrder: readonly string[],
): "updated" | "inserted" | "removed" | "noop" {
  const existingIdx = section.body.findIndex((e) => e.kind === "property" && e.key === key);
  const existing = existingIdx >= 0 ? (section.body[existingIdx] as Extract<BodyEntry, { kind: "property" }>) : null;

  if (rawValue === null) {
    if (existing) {
      section.body.splice(existingIdx, 1);
      return "removed";
    }
    return "noop";
  }

  if (existing) {
    // Skip the update if the raw text already matches — preserves
    // byte-identical output when nothing actually changed.
    const trimmed = existing.rawAfterEquals.trim();
    if (trimmed === rawValue) return "noop";
    setPropertyRaw(section, key, rawValue);
    return "updated";
  }

  insertPropertyOrdered(section, key, rawValue, fieldOrder);
  return "inserted";
}

// ---- Value serializers -----------------------------------------------------

// Quoted Godot string with the standard escape set (\\, \", \n, \r, \t).
export function serializeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\") out += "\\\\";
    else if (c === '"') out += '\\"';
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else out += c;
  }
  out += '"';
  return out;
}

export function serializeInt(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`serializeInt: ${n} is not an integer`);
  }
  return String(n);
}

export function serializeBool(b: boolean): string {
  return b ? "true" : "false";
}

export function serializeEnumInt(value: string, mapping: Record<string, number>): string {
  const n = mapping[value];
  if (n === undefined) {
    throw new Error(`serializeEnumInt: unknown enum value "${value}". Known: ${Object.keys(mapping).join(", ")}`);
  }
  return String(n);
}

export const quoteString = serializeString;

// ---- Section (sub_resource) manipulation ----------------------------------

// Removes the section matching `kind` AND `id` (sub_resource id attr).
// Returns true on removal. Does not touch any references to it elsewhere
// — caller is responsible for cleaning up arrays that pointed at it.
export function removeSectionById(doc: Doc, kind: SectionKind, id: string): boolean {
  const idx = doc.sections.findIndex(
    (s) => s.kind === kind && getAttrValue(s, "id") === id,
  );
  if (idx < 0) return false;
  doc.sections.splice(idx, 1);
  return true;
}

// Inserts a new section into doc.sections immediately before `before`.
// `before` can be either a section kind (e.g. "resource" — inserts before
// the first such section) or a specific Section reference. If the target
// isn't found, appends to the end.
export function insertSectionBefore(
  doc: Doc,
  before: SectionKind | Section,
  newSection: Section,
): void {
  let idx: number;
  if (typeof before === "string") {
    idx = doc.sections.findIndex((s) => s.kind === before);
  } else {
    idx = doc.sections.indexOf(before);
  }
  if (idx < 0) doc.sections.push(newSection);
  else doc.sections.splice(idx, 0, newSection);
}

// Adds a new `[ext_resource]` line to the document, immediately after the
// last existing ext_resource (preserving the trailing blank line). The new
// id follows Godot's `<num>_<5alnum>` convention; `numberHint` defaults to
// max(existing num) + 1. Returns the minted id so callers can reference it
// from sub_resource property values (e.g. `ExtResource("3_abcde")`).
//
// If the file has no existing ext_resources at all, the new one is inserted
// before the first sub_resource (or [resource]).
export interface AddExtResourceOpts {
  type: string;
  uid: string;
  path: string;
  numberHint?: number;
}

export function addExtResource(doc: Doc, opts: AddExtResourceOpts): string {
  const existingIds = new Set<string>();
  let maxNum = 0;
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    const id = getAttrValue(s, "id");
    if (!id) continue;
    existingIds.add(id);
    const m = id.match(/^(\d+)_/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]!, 10));
  }
  const numPrefix = opts.numberHint ?? maxNum + 1;
  let newId = "";
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = `${numPrefix}_${randomAlnum(5)}`;
    if (!existingIds.has(candidate)) {
      newId = candidate;
      break;
    }
  }
  if (!newId) throw new Error("addExtResource: exhausted id attempts");

  const eol = inferDocEol(doc);
  const headerLine =
    `[ext_resource type="${opts.type}" uid="${opts.uid}" path="${opts.path}" id="${newId}"]${eol}`;
  const newSection: Section = {
    kind: "ext_resource",
    rawHeaderLine: headerLine,
    attrs: [
      { key: "type", rawValue: `"${opts.type}"` },
      { key: "uid", rawValue: `"${opts.uid}"` },
      { key: "path", rawValue: `"${opts.path}"` },
      { key: "id", rawValue: `"${newId}"` },
    ],
    body: [],
  };

  // Find the last existing ext_resource and append the new one right after.
  let lastExtIdx = -1;
  for (let i = 0; i < doc.sections.length; i++) {
    if (doc.sections[i]!.kind === "ext_resource") lastExtIdx = i;
  }
  if (lastExtIdx >= 0) {
    // Move trailing blank entries from the previous-last to the new section
    // so they end up between the new ext_resource and whatever follows.
    const prevLast = doc.sections[lastExtIdx]!;
    const trailingBlanks: BodyEntry[] = [];
    while (
      prevLast.body.length > 0 &&
      prevLast.body[prevLast.body.length - 1]!.kind === "blank"
    ) {
      trailingBlanks.unshift(prevLast.body.pop()!);
    }
    doc.sections.splice(lastExtIdx + 1, 0, newSection);
    newSection.body.push(...trailingBlanks);
  } else {
    // No existing ext_resources — fall back to inserting before sub_resource
    // or [resource], with a trailing blank for spacing.
    newSection.body.push({ kind: "blank", raw: eol });
    const subIdx = doc.sections.findIndex((s) => s.kind === "sub_resource");
    if (subIdx >= 0) doc.sections.splice(subIdx, 0, newSection);
    else insertSectionBefore(doc, "resource", newSection);
  }

  return newId;
}

// Locates a `[sub_resource]` by its id attribute. Returns undefined if no
// such sub_resource exists in the document.
export function findSubResourceById(doc: Doc, id: string): Section | undefined {
  return doc.sections.find(
    (s) => s.kind === "sub_resource" && getAttrValue(s, "id") === id,
  );
}

// Reads the SubResource ids referenced by a property's array value, in
// source order. Value text shape: `[SubResource("X"), SubResource("Y")]`.
export function extractRefArray(section: Section, key: string): string[] {
  const entry = section.body.find((e) => e.kind === "property" && e.key === key);
  if (!entry || entry.kind !== "property") return [];
  const ids: string[] = [];
  const re = /SubResource\("([^"]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry.rawAfterEquals)) !== null) {
    ids.push(m[1]!);
  }
  return ids;
}

// Reconciles a JSON array of sub_resource-backed entries with the .tres
// representation, using `_subId` for stable identity. Handles add, update,
// remove, AND reorder in one pass:
//
//   - For each JSON entry in order:
//     - If its _subId matches an unclaimed existing sub_resource → reconcile
//       its scalars.
//     - Otherwise → build a new sub_resource (mint id).
//   - .tres sub_resources whose ids weren't claimed → remove (caller can
//     hook orphan cleanup via onRemove).
//   - Update the host's `arrayKey` property to reflect the final order.
//
// Reorder safety: existing entries reorder by virtue of finalIds being built
// in JSON order; the sub_resource bodies stay where they are in the file
// (Godot resolves by id, not position).
export type ReconcileAction = "updated" | "inserted" | "removed" | "noop";

export interface SubArrayReconcileOps<T extends { _subId?: string }> {
  reconcileExisting(section: Section, entry: T): { key: string; action: ReconcileAction }[];
  buildNew(entry: T, subId: string): Section | null; // return null if cannot build (caller warns)
  insertBefore: SectionKind | Section;
  onRemove?(subId: string): void;
  /** When set, the array property line is emitted in Godot 4's typed-array
   *  form, `Array[ExtResource("<extId>")]([SubResource(...), ...])`. Required
   *  for C# fields declared as `Godot.Collections.Array<T>`. */
  typedArrayExtId?: string;
}

export interface SubArrayReconcileResult {
  added: { index: number; subId: string }[];
  updated: {
    index: number;
    subId: string;
    actions: { key: string; action: ReconcileAction }[];
  }[];
  removed: { subId: string }[];
}

export function reconcileSubResourceArray<T extends { _subId?: string }>(
  doc: Doc,
  arrayHostSection: Section,
  arrayKey: string,
  arrayFieldOrder: readonly string[],
  jsonEntries: T[],
  ops: SubArrayReconcileOps<T>,
): SubArrayReconcileResult {
  const originalIds = extractRefArray(arrayHostSection, arrayKey);
  const originalSet = new Set(originalIds);
  const consumed = new Set<string>();
  const finalIds: string[] = [];
  const added: SubArrayReconcileResult["added"] = [];
  const updated: SubArrayReconcileResult["updated"] = [];
  const removed: SubArrayReconcileResult["removed"] = [];

  for (let i = 0; i < jsonEntries.length; i++) {
    const entry = jsonEntries[i]!;
    const wantedId = entry._subId;
    if (wantedId && originalSet.has(wantedId) && !consumed.has(wantedId)) {
      const section = findSubResourceById(doc, wantedId);
      if (section) {
        const actions = ops.reconcileExisting(section, entry);
        consumed.add(wantedId);
        finalIds.push(wantedId);
        updated.push({ index: i, subId: wantedId, actions });
        continue;
      }
    }
    const subId = mintSubResourceId(doc);
    const newSection = ops.buildNew(entry, subId);
    if (newSection) {
      insertSectionBefore(doc, ops.insertBefore, newSection);
      finalIds.push(subId);
      added.push({ index: i, subId });
    }
  }

  for (const oid of originalIds) {
    if (consumed.has(oid)) continue;
    if (ops.onRemove) ops.onRemove(oid);
    removeSectionById(doc, "sub_resource", oid);
    removed.push({ subId: oid });
  }

  reconcileProperty(
    arrayHostSection,
    arrayKey,
    finalIds.length === 0
      ? null
      : serializeSubRefArray(finalIds, ops.typedArrayExtId),
    arrayFieldOrder,
  );

  return { added, updated, removed };
}

// Mints a sub_resource id in Godot's format: `<ClassName>_<5alnum>`.
// Default ClassName is "Resource" (matching what Godot writes for plain
// scripted Resource sub_resources). Guarantees no collision with existing
// sub_resource ids in `doc`.
export function mintSubResourceId(doc: Doc, className: string = "Resource"): string {
  const existing = new Set<string>();
  for (const s of doc.sections) {
    if (s.kind === "sub_resource") {
      const id = getAttrValue(s, "id");
      if (id) existing.add(id);
    }
  }
  for (let attempt = 0; attempt < 1000; attempt++) {
    const suffix = randomAlnum(5);
    const candidate = `${className}_${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("mintSubResourceId: exhausted attempts (highly unlikely)");
}

// Builds a `[sub_resource type="..." id="..."]` Section with the given body
// properties. `properties` is in source-order (the order they should appear);
// metadata is typically last. Each value is the raw text (already serialized).
export function buildSubResourceSection(opts: {
  type: string;
  id: string;
  properties: { key: string; rawValue: string }[];
  eol?: string;
}): Section {
  const eol = opts.eol ?? "\n";
  const headerLine = `[sub_resource type="${opts.type}" id="${opts.id}"]${eol}`;
  const body: BodyEntry[] = opts.properties.map((p) => ({
    kind: "property" as const,
    key: p.key,
    rawAfterEquals: ` ${p.rawValue}${eol}`,
    rawLine: `${p.key} = ${p.rawValue}${eol}`,
  }));
  // Trailing blank line, matching Godot's between-section convention.
  body.push({ kind: "blank", raw: eol });
  return {
    kind: "sub_resource",
    rawHeaderLine: headerLine,
    attrs: [
      { key: "type", rawValue: `"${opts.type}"` },
      { key: "id", rawValue: `"${opts.id}"` },
    ],
    body,
  };
}

export function getAttrValue(section: Section, key: string): string | undefined {
  const a = section.attrs.find((x) => x.key === key);
  if (!a) return undefined;
  const v = a.rawValue;
  if (v.startsWith('"') && v.endsWith('"')) return v.substring(1, v.length - 1);
  return v;
}

// Serializes an array of sub_resource ids as Godot's array literal:
//   [SubResource("X"), SubResource("Y")]
//
// When `typedArrayExtId` is set, wraps the bare list in Godot 4's typed-array
// literal — `Array[ExtResource("<id>")]([SubResource("X"), ...])` — matching
// the shape Godot emits for C# fields declared as `Godot.Collections.Array<T>`
// (e.g. NpcData.LootTable.Entries). For plain `T[]` C# arrays (e.g.
// KarmaImpact.Deltas) leave it unset.
export function serializeSubRefArray(
  ids: readonly string[],
  typedArrayExtId?: string,
): string {
  const bare =
    ids.length === 0
      ? "[]"
      : "[" + ids.map((id) => `SubResource("${id}")`).join(", ") + "]";
  return typedArrayExtId
    ? `Array[ExtResource("${typedArrayExtId}")](${bare})`
    : bare;
}

function randomAlnum(len: number): string {
  // Godot-style ids use lowercase alnum.
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ---- Helpers ---------------------------------------------------------------

function makePropertyEntry(key: string, rawValue: string, eol: string): Extract<BodyEntry, { kind: "property" }> {
  return {
    kind: "property",
    key,
    rawAfterEquals: ` ${rawValue}${eol}`,
    rawLine: `${key} = ${rawValue}${eol}`,
  };
}

function detectEol(line: string): string {
  if (line.endsWith("\r\n")) return "\r\n";
  if (line.endsWith("\n")) return "\n";
  return "\n";
}

// Infers a section's line ending from an existing property; defaults to "\n".
function inferSectionEol(section: Section): string {
  for (const e of section.body) {
    if (e.kind === "property") return detectEol(e.rawLine);
    if (e.kind === "blank") return detectEol(e.raw);
  }
  return detectEol(section.rawHeaderLine);
}

// Infers EOL convention for the whole document. Looks at the first section's
// header line; if none exists, defaults to "\n".
function inferDocEol(doc: Doc): string {
  for (const s of doc.sections) {
    const e = detectEol(s.rawHeaderLine);
    return e;
  }
  return "\n";
}
