/**
 * Minimal parser for Godot .tres (text resource) files. Handles the shapes
 * used by Flock of Bleeps' authored content: gd_resource header, ext_resource
 * blocks, sub_resource blocks (with property bodies), the main [resource]
 * block, and value types we actually see — strings, ints, floats, bools,
 * ExtResource(...) / SubResource(...) refs, arrays of those, Rect2, Vector2,
 * Color. Skips `metadata/*` keys.
 *
 * NOT a faithful Godot parser — only the subset bleepforge needs to import
 * Quest / KarmaImpact / ItemData / QuestItemData / DialogSequence resources.
 */

export type TresValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "ext_ref"; id: string }
  | { kind: "sub_ref"; id: string }
  | { kind: "array"; items: TresValue[] }
  | { kind: "rect2"; x: number; y: number; w: number; h: number }
  | { kind: "vector2"; x: number; y: number }
  | { kind: "color"; r: number; g: number; b: number; a: number }
  | { kind: "raw"; value: string };

export interface TresExtResource {
  type: string;
  path: string;
  uid?: string;
  id: string;
}

export interface TresSubResource {
  type: string;
  id: string;
  props: Record<string, TresValue>;
}

export interface ParsedTres {
  scriptClass?: string;
  format?: number;
  uid?: string;
  extResources: Map<string, TresExtResource>;
  subResources: Map<string, TresSubResource>;
  resourceProps: Record<string, TresValue>;
}

export function parseTres(text: string): ParsedTres {
  const lines = text.split("\n");
  const out: ParsedTres = {
    extResources: new Map(),
    subResources: new Map(),
    resourceProps: {},
  };

  type Section =
    | { kind: "ext"; attrs: Record<string, string> }
    | { kind: "sub"; type: string; id: string; props: Record<string, TresValue> }
    | { kind: "main"; props: Record<string, TresValue> };

  let section: Section | null = null;

  const finalize = (s: Section | null) => {
    if (!s) return;
    if (s.kind === "ext") {
      const id = s.attrs.id;
      if (!id) return;
      out.extResources.set(id, {
        type: s.attrs.type ?? "",
        path: s.attrs.path ?? "",
        uid: s.attrs.uid,
        id,
      });
    } else if (s.kind === "sub") {
      out.subResources.set(s.id, { type: s.type, id: s.id, props: s.props });
    } else if (s.kind === "main") {
      out.resourceProps = s.props;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }

    if (line.startsWith("[")) {
      finalize(section);
      const closing = line.lastIndexOf("]");
      const inner = closing > 0 ? line.substring(1, closing) : line.substring(1);
      const sp = inner.indexOf(" ");
      const kind = sp >= 0 ? inner.substring(0, sp) : inner;
      const attrsStr = sp >= 0 ? inner.substring(sp + 1) : "";
      const attrs = parseAttrs(attrsStr);

      if (kind === "gd_resource") {
        out.scriptClass = attrs.script_class;
        out.format = attrs.format ? parseInt(attrs.format, 10) : undefined;
        out.uid = attrs.uid;
        section = null;
      } else if (kind === "ext_resource") {
        section = { kind: "ext", attrs };
      } else if (kind === "sub_resource") {
        section = {
          kind: "sub",
          type: attrs.type ?? "",
          id: attrs.id ?? "",
          props: {},
        };
      } else if (kind === "resource") {
        section = { kind: "main", props: {} };
      } else {
        // Unknown section type — drop.
        section = null;
      }
      i++;
      continue;
    }

    // Property line in a section that accepts properties.
    if (section && (section.kind === "sub" || section.kind === "main")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const key = line.substring(0, eq).trim();
        let valueStr = line.substring(eq + 1).trim();
        // Aggregate continuation lines until brackets/quotes balance.
        while (!isBalanced(valueStr) && i + 1 < lines.length) {
          i++;
          valueStr += " " + lines[i]!.trim();
        }
        if (!key.startsWith("metadata/")) {
          section.props[key] = parseValue(valueStr);
        }
      }
    }
    i++;
  }
  finalize(section);
  return out;
}

// ---- Helpers --------------------------------------------------------------

function parseAttrs(str: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i]!)) i++;
    if (i >= str.length) break;
    const keyStart = i;
    while (i < str.length && str[i] !== "=" && !/\s/.test(str[i]!)) i++;
    const key = str.substring(keyStart, i).trim();
    if (i >= str.length || str[i] !== "=") {
      // Boolean-ish or malformed — skip
      while (i < str.length && !/\s/.test(str[i]!)) i++;
      continue;
    }
    i++; // skip =
    if (str[i] === '"') {
      i++; // skip opening quote
      let valueStart = i;
      while (i < str.length && str[i] !== '"') {
        if (str[i] === "\\") i++; // skip next char (escaped)
        i++;
      }
      out[key] = unescapeString(str.substring(valueStart, i));
      if (i < str.length) i++; // skip closing quote
    } else {
      const valueStart = i;
      while (i < str.length && !/\s/.test(str[i]!)) i++;
      out[key] = str.substring(valueStart, i);
    }
  }
  return out;
}

function isBalanced(s: string): boolean {
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

function unescapeString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\" && i + 1 < s.length) {
      const n = s[i + 1]!;
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else if (n === '"') out += '"';
      else if (n === "\\") out += "\\";
      else out += n;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

function parseValue(s: string): TresValue {
  s = s.trim();
  if (!s) return { kind: "raw", value: "" };

  // Strip a trailing comment (rare but safe)
  if (s.startsWith('"')) {
    const end = findStringEnd(s, 0);
    const value = unescapeString(s.substring(1, end));
    return { kind: "string", value };
  }
  if (s === "true") return { kind: "bool", value: true };
  if (s === "false") return { kind: "bool", value: false };
  if (/^-?\d+$/.test(s)) return { kind: "number", value: parseInt(s, 10) };
  if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(s) || /^-?\d+\.\d*([eE][-+]?\d+)?$/.test(s)) {
    return { kind: "number", value: parseFloat(s) };
  }
  if (s.startsWith("ExtResource(")) {
    const m = s.match(/^ExtResource\(\s*"([^"]*)"\s*\)/);
    if (m) return { kind: "ext_ref", id: m[1]! };
  }
  if (s.startsWith("SubResource(")) {
    const m = s.match(/^SubResource\(\s*"([^"]*)"\s*\)/);
    if (m) return { kind: "sub_ref", id: m[1]! };
  }
  if (s.startsWith("Rect2(")) {
    const m = s.match(/^Rect2\(\s*([^)]+)\)/);
    if (m) {
      const parts = m[1]!.split(",").map((x) => parseFloat(x.trim()));
      return { kind: "rect2", x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
    }
  }
  if (s.startsWith("Vector2(")) {
    const m = s.match(/^Vector2\(\s*([^)]+)\)/);
    if (m) {
      const parts = m[1]!.split(",").map((x) => parseFloat(x.trim()));
      return { kind: "vector2", x: parts[0]!, y: parts[1]! };
    }
  }
  if (s.startsWith("Color(")) {
    const m = s.match(/^Color\(\s*([^)]+)\)/);
    if (m) {
      const parts = m[1]!.split(",").map((x) => parseFloat(x.trim()));
      return {
        kind: "color",
        r: parts[0]!,
        g: parts[1]!,
        b: parts[2]!,
        a: parts[3] ?? 1,
      };
    }
  }
  if (s.startsWith("[")) return parseArray(s);
  return { kind: "raw", value: s };
}

function findStringEnd(s: string, startQuoteIdx: number): number {
  let i = startQuoteIdx + 1;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"') return i;
    i++;
  }
  return s.length;
}

function parseArray(s: string): TresValue {
  // Strip leading optional "Array[T](" wrapper if present.
  let body = s;
  const aMatch = body.match(/^Array\[[^\]]+\]\(\s*([\s\S]*)\)\s*$/);
  if (aMatch) body = aMatch[1]!;
  // Now body should start with [ and end with ]
  body = body.trim();
  if (!body.startsWith("[")) return { kind: "raw", value: s };
  const close = findMatchingClose(body, 0, "[", "]");
  const inner = body.substring(1, close).trim();
  if (!inner) return { kind: "array", items: [] };
  const parts = splitTopLevel(inner);
  return { kind: "array", items: parts.map((p) => parseValue(p.trim())) };
}

function findMatchingClose(s: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  let inString = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (c === "\\") {
        i++;
      } else if (c === '"') {
        inString = false;
      }
    } else {
      if (c === '"') inString = true;
      else if (c === open || c === "(") depth++;
      else if (c === close || c === ")") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return s.length - 1;
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
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
      else if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "," && depth === 0) {
        parts.push(s.substring(start, i));
        start = i + 1;
      }
    }
  }
  parts.push(s.substring(start));
  return parts;
}

// ---- Convenience accessors ------------------------------------------------

export const valueAsString = (v?: TresValue): string | undefined =>
  v?.kind === "string" ? v.value : undefined;
export const valueAsNumber = (v?: TresValue): number | undefined =>
  v?.kind === "number" ? v.value : undefined;
export const valueAsBool = (v?: TresValue): boolean | undefined =>
  v?.kind === "bool" ? v.value : undefined;
export const valueAsArray = (v?: TresValue): TresValue[] | undefined =>
  v?.kind === "array" ? v.items : undefined;
export const valueAsExtRef = (v?: TresValue): string | undefined =>
  v?.kind === "ext_ref" ? v.id : undefined;
export const valueAsSubRef = (v?: TresValue): string | undefined =>
  v?.kind === "sub_ref" ? v.id : undefined;
