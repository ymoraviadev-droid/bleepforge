import type { BodyEntry, Doc, ParsedAttr, Section, SectionKind } from "./types.js";

// Parses .tres into a round-trip-faithful AST. Concatenating
// `preamble + sections.rawHeaderLine + body.rawLine|raw + postamble` in order
// reproduces the input byte-for-byte (asserted by the harness).

const SECTION_KINDS: SectionKind[] = ["gd_resource", "ext_resource", "sub_resource", "resource"];

export function parseTres(text: string): Doc {
  const lines = splitLinesKeepEnding(text);
  const sections: Section[] = [];
  let i = 0;
  let preamble = "";

  // Anything before the first `[` line is preamble.
  while (i < lines.length && !lines[i]!.trimStart().startsWith("[")) {
    preamble += lines[i]!;
    i++;
  }

  while (i < lines.length) {
    const headerLine = lines[i]!;
    if (!headerLine.trimStart().startsWith("[")) {
      // Stray content between sections — treat as opaque and stop parsing
      // sections; rest goes into postamble.
      break;
    }
    i++;

    const { kind, attrs } = parseHeaderLine(headerLine);
    const body: BodyEntry[] = [];

    while (i < lines.length && !lines[i]!.trimStart().startsWith("[")) {
      const line = lines[i]!;
      i++;

      if (line.trim() === "") {
        body.push({ kind: "blank", raw: line });
        continue;
      }

      const eq = indexOfTopLevelEquals(line);
      if (eq < 0) {
        body.push({ kind: "opaque", raw: line });
        continue;
      }

      const key = line.substring(0, eq).trim();
      let rawAfterEquals = line.substring(eq + 1);
      let rawLine = line;

      // Continuation: gobble more lines until brackets/quotes balance.
      while (!isBalanced(rawAfterEquals) && i < lines.length) {
        const next = lines[i]!;
        rawAfterEquals += next;
        rawLine += next;
        i++;
      }

      body.push({ kind: "property", key, rawAfterEquals, rawLine });
    }

    sections.push({ kind, rawHeaderLine: headerLine, attrs, body });
  }

  // Anything after the last recognizable section.
  let postamble = "";
  while (i < lines.length) {
    postamble += lines[i]!;
    i++;
  }

  return { preamble, sections, postamble };
}

// ---- Helpers --------------------------------------------------------------

// Splits text into lines, with each line including its trailing newline
// (\n or \r\n) if present. The final line may have no newline.
export function splitLinesKeepEnding(text: string): string[] {
  if (text === "") return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 /* \n */) {
      out.push(text.substring(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.substring(start));
  return out;
}

function parseHeaderLine(line: string): { kind: SectionKind; attrs: ParsedAttr[] } {
  // Find the bracketed content; ignore trailing newline/whitespace.
  const open = line.indexOf("[");
  const close = line.lastIndexOf("]");
  const inner = open >= 0 && close > open ? line.substring(open + 1, close) : line;

  // First token is the section kind.
  let i = 0;
  while (i < inner.length && /\s/.test(inner[i]!)) i++;
  const kindStart = i;
  while (i < inner.length && !/\s/.test(inner[i]!)) i++;
  const kindStr = inner.substring(kindStart, i);
  const kind: SectionKind = (SECTION_KINDS as string[]).includes(kindStr)
    ? (kindStr as SectionKind)
    : ("resource" as SectionKind); // fallback; unknown kinds become resource-shaped

  const attrs = parseAttrs(inner.substring(i));
  return { kind, attrs };
}

function parseAttrs(str: string): ParsedAttr[] {
  const out: ParsedAttr[] = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i]!)) i++;
    if (i >= str.length) break;

    const keyStart = i;
    while (i < str.length && str[i] !== "=" && !/\s/.test(str[i]!)) i++;
    const key = str.substring(keyStart, i);

    while (i < str.length && /\s/.test(str[i]!)) i++;
    if (str[i] !== "=") continue;
    i++; // skip =
    while (i < str.length && /\s/.test(str[i]!)) i++;

    const valueStart = i;
    if (str[i] === '"') {
      i++; // opening quote
      while (i < str.length && str[i] !== '"') {
        if (str[i] === "\\" && i + 1 < str.length) i += 2;
        else i++;
      }
      if (str[i] === '"') i++; // closing quote
    } else {
      while (i < str.length && !/\s/.test(str[i]!)) i++;
    }
    const rawValue = str.substring(valueStart, i);
    out.push({ key, rawValue });
  }
  return out;
}

// Returns the index of the `=` that separates property key from value
// at top level (outside brackets/quotes). Property keys never contain `=`,
// so the first un-nested `=` is the right one.
function indexOfTopLevelEquals(line: string): number {
  let inString = false;
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inString) {
      if (c === "\\") {
        i++;
      } else if (c === '"') {
        inString = false;
      }
    } else {
      if (c === '"') inString = true;
      else if (c === "[" || c === "(") depth++;
      else if (c === "]" || c === ")") depth--;
      else if (c === "=" && depth === 0) return i;
    }
  }
  return -1;
}

export function isBalanced(s: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (c === "\\") {
        i++;
      } else if (c === '"') {
        inString = false;
      }
    } else {
      if (c === '"') inString = true;
      else if (c === "[" || c === "(") depth++;
      else if (c === "]" || c === ")") depth--;
    }
  }
  return depth === 0 && !inString;
}

// ---- Convenience --------------------------------------------------------

export function getAttr(attrs: ParsedAttr[], key: string): string | undefined {
  const a = attrs.find((x) => x.key === key);
  if (!a) return undefined;
  // Strip quotes if present
  const v = a.rawValue;
  if (v.startsWith('"') && v.endsWith('"')) return v.substring(1, v.length - 1);
  return v;
}
