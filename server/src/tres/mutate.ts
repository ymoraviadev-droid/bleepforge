import type { BodyEntry, Section } from "./types.js";

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
