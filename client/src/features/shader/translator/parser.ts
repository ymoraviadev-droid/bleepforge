// Lightweight GDShader scanner. Validates that the source falls inside
// the translator's subset (canvas_item shader_type, no banned features)
// and extracts the metadata the emitter + UI need:
//   - Uniform declarations (type, name, hint, default) → drives the
//     auto-generated uniform controls in PreviewCanvas.
//   - Body of the `void fragment()` function → fed to the emitter as
//     verbatim source with TEXTURE/FRAGCOORD substituted.
//
// Deliberately NOT a full GLSL parser. We strip comments, scan for the
// shader_type line + uniform declarations + the fragment() body with
// regex, and trust the WebGL compiler to catch anything subtler. The
// payoff is ~150 lines for parser + emitter vs. ~1000 for a real
// recursive-descent parser, at the cost of slightly less helpful error
// messages — which we mitigate by surfacing the WebGL compile error
// itself (with line numbers) when our quick scan accepts something the
// GPU rejects.

import {
  BANNED_FEATURES,
  RESERVED_UNIFORM_NAMES,
  SUPPORTED_HINTS,
  SUPPORTED_SHADER_TYPES,
  SUPPORTED_UNIFORM_TYPES,
} from "./subset";

export type UniformType =
  | "bool"
  | "int"
  | "float"
  | "vec2"
  | "vec3"
  | "vec4"
  | "sampler2D";

export interface UniformHint {
  name: string;
  /** Args, raw text, in order. e.g. `hint_range(0.0, 1.0, 0.01)` → `["0.0", "1.0", "0.01"]`. */
  args: string[];
}

export interface UniformDecl {
  type: UniformType;
  name: string;
  hint: UniformHint | null;
  /** Default value as written (right-hand side of `= ...`). Null when omitted. */
  defaultValue: string | null;
}

export interface ParseSuccess {
  ok: true;
  /** Original source with comments stripped — what the emitter consumes. */
  source: string;
  /** Original source as the user wrote it — kept so the UI can map error
   *  lines back to what's visible in the editor. */
  rawSource: string;
  /** Detected shader_type. Always one of SUPPORTED_SHADER_TYPES. */
  shaderType: string;
  uniforms: UniformDecl[];
  /** The body of `void fragment() { ... }` (between the braces, exclusive).
   *  Null when no fragment function is present — the shader is well-formed
   *  but won't produce useful output. */
  fragmentBody: string | null;
  /** Starting line (1-indexed in raw source) of fragment()'s opening
   *  brace. Used to map emitted GLSL error lines back to the user's
   *  source. */
  fragmentBodyStartLine: number;
}

export interface ParseFailure {
  ok: false;
  reason: string;
  /** 1-indexed line in raw source where the problem was detected, or
   *  null if the location is unknown. */
  line: number | null;
}

export type ParseResult = ParseSuccess | ParseFailure;

const SHADER_TYPE_RE = /^\s*shader_type\s+([a-z_][a-z0-9_]*)\s*;/m;
// Captures: 1=type 2=name 3=hint+args (optional) 4=default (optional, anything-up-to-semicolon)
const UNIFORM_RE =
  /\buniform\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s*([^=;]+?))?\s*(?:=\s*([^;]+?))?\s*;/g;
const FRAGMENT_RE = /\bvoid\s+fragment\s*\(\s*\)\s*\{/;

export function parseGdshader(rawSource: string): ParseResult {
  // Strip comments first so the regex scanners don't trip on
  // commented-out keywords. We keep newlines in place of stripped
  // content so line numbers stay aligned with the raw source.
  const source = stripComments(rawSource);

  // shader_type validation — must be present and in the supported set.
  const stMatch = SHADER_TYPE_RE.exec(source);
  if (!stMatch) {
    return {
      ok: false,
      reason: "No `shader_type` declaration found. The translator needs a `shader_type canvas_item;` line to know what stage to compile.",
      line: 1,
    };
  }
  const shaderType = stMatch[1]!;
  if (!SUPPORTED_SHADER_TYPES.includes(shaderType)) {
    return {
      ok: false,
      reason: `shader_type "${shaderType}" isn't in the v1 translator subset. Only canvas_item is supported for live preview (other types would need different vertex stages + built-in sets).`,
      line: lineOf(source, stMatch.index),
    };
  }

  // Banned feature scan. We walk each banned-feature needle against the
  // stripped source (so a commented-out usage doesn't trip the alarm)
  // and report the FIRST hit so the user gets a single, specific error
  // rather than a wall of complaints.
  for (const banned of BANNED_FEATURES) {
    const idx = findWord(source, banned.match);
    if (idx >= 0) {
      return {
        ok: false,
        reason: banned.reason,
        line: lineOf(source, idx),
      };
    }
  }

  // Uniform scan. Each match yields type + name + optional hint + optional default.
  const uniforms: UniformDecl[] = [];
  UNIFORM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = UNIFORM_RE.exec(source)) !== null) {
    const [, rawType, name, rawHint, rawDefault] = match;
    if (!rawType || !name) continue;
    if (!SUPPORTED_UNIFORM_TYPES.includes(rawType)) {
      return {
        ok: false,
        reason: `uniform "${name}" has unsupported type "${rawType}". The translator supports: ${SUPPORTED_UNIFORM_TYPES.join(", ")}.`,
        line: lineOf(source, match.index),
      };
    }
    if (RESERVED_UNIFORM_NAMES.has(name)) {
      return {
        ok: false,
        reason: `uniform name "${name}" collides with a translator-injected symbol (built-in, varying, or prelude uniform). Rename the uniform to something Bleepforge doesn't already emit.`,
        line: lineOf(source, match.index),
      };
    }
    const hint = rawHint ? parseHint(rawHint.trim()) : null;
    if (rawHint && !hint) {
      return {
        ok: false,
        reason: `Couldn't parse the hint annotation for uniform "${name}".`,
        line: lineOf(source, match.index),
      };
    }
    if (hint && !SUPPORTED_HINTS.includes(hint.name)) {
      return {
        ok: false,
        reason: `Unsupported hint "${hint.name}" on uniform "${name}". The translator supports: ${SUPPORTED_HINTS.join(", ")}.`,
        line: lineOf(source, match.index),
      };
    }
    uniforms.push({
      type: rawType as UniformType,
      name,
      hint,
      defaultValue: rawDefault ? rawDefault.trim() : null,
    });
  }

  // fragment() body extraction. Optional — a shader with no fragment()
  // is well-formed and we'll emit one that just writes through COLOR.
  let fragmentBody: string | null = null;
  let fragmentBodyStartLine = 0;
  const fragMatch = FRAGMENT_RE.exec(source);
  if (fragMatch) {
    const bodyStart = fragMatch.index + fragMatch[0].length;
    const bodyEnd = findMatchingBrace(source, bodyStart - 1);
    if (bodyEnd < 0) {
      return {
        ok: false,
        reason: "`void fragment()` block has no matching closing brace.",
        line: lineOf(source, fragMatch.index),
      };
    }
    fragmentBody = source.slice(bodyStart, bodyEnd);
    fragmentBodyStartLine = lineOf(source, bodyStart);
  }

  return {
    ok: true,
    source,
    rawSource,
    shaderType,
    uniforms,
    fragmentBody,
    fragmentBodyStartLine,
  };
}

// Strips // line comments and /* block comments */ from source. Replaces
// each stripped run with the same number of newlines (so line numbers
// stay aligned with the raw source) plus spaces for the rest of the
// stripped characters.
function stripComments(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1];
    if (ch === "/" && next === "/") {
      // Line comment — skip to newline, keep the newline.
      while (i < s.length && s[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      // Block comment — skip to */, preserving newlines.
      i += 2;
      out += "  ";
      while (i < s.length) {
        if (s[i] === "*" && s[i + 1] === "/") {
          out += "  ";
          i += 2;
          break;
        }
        out += s[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function parseHint(raw: string): UniformHint | null {
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\((.*)\))?$/.exec(raw);
  if (!m) return null;
  const name = m[1]!;
  const argsRaw = m[2] ?? "";
  const args = argsRaw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  return { name, args };
}

// Finds whole-word occurrence of `needle` in `haystack` — protects
// against partial matches (e.g. "varying" not matching "myvarying_x").
function findWord(haystack: string, needle: string): number {
  // For multi-word needles (none today, but the API supports it) just
  // do substring match; the words inside are separated by whitespace
  // anyway so we won't false-positive on identifiers.
  if (needle.includes(" ")) return haystack.indexOf(needle);
  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`);
  const m = re.exec(haystack);
  return m ? m.index : -1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns 1-indexed line number for a given character index.
function lineOf(source: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

// Given the index of an opening `{`, finds the matching `}`. Tracks
// nesting depth; ignores braces inside strings / character literals
// (rare in GLSL but defensive). Returns -1 if no match.
function findMatchingBrace(s: string, openIdx: number): number {
  if (s[openIdx] !== "{") return -1;
  let depth = 0;
  let i = openIdx;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}
