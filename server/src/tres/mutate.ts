import type { BodyEntry, Section } from "./types.js";

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
  const newLine = `${key} = ${newRawValue}${eol}`;
  section.body[idx] = {
    kind: "property",
    key,
    rawAfterEquals: ` ${newRawValue}${eol}`,
    rawLine: newLine,
  };
  return true;
}

// Serializes a JS string into Godot's quoted-string form. Matches the escape
// set Godot's text saver uses (\\, \", \n, \r, \t). Anything else is emitted
// as-is — Godot accepts UTF-8 in .tres without escaping.
export function quoteString(s: string): string {
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

function detectEol(line: string): string {
  if (line.endsWith("\r\n")) return "\r\n";
  if (line.endsWith("\n")) return "\n";
  return "\n";
}
