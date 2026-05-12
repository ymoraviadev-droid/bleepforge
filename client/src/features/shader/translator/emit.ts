// GDShader → GLSL ES 3.00 emitter. Consumes a ParseSuccess from
// parser.ts and produces a self-contained GLSL fragment shader plus a
// source map so the runtime can map WebGL compile errors back to lines
// the user can find in their editor.
//
// Translation strategy:
//   1. Emit a fixed prelude (precision, varyings, our injected uniforms,
//      math constants).
//   2. Emit each user uniform stripped of its Godot-specific hint +
//      default (GLSL has no place for those — they're UI metadata).
//   3. Emit each user-defined helper function at module scope, with
//      built-in references in the body rewritten via the
//      HELPER_SUBSTITUTION_MAP so they resolve to underlying
//      uniforms / varyings instead of main()'s locals (which aren't
//      reachable from a helper).
//   4. Open `void main()`, declare every local-built-in
//      (TIME / UV / COLOR / ...) as `<type> name = <init>` so the
//      user's fragment body sees them as plain variables. (Helpers
//      can't see these — they got rewritten in step 3.)
//   5. Splice the user's fragment() body verbatim with TEXTURE +
//      FRAGCOORD substitutions (the existing SUBSTITUTION_BUILTINS
//      set — narrow because fragment body already has locals for
//      everything else).
//   6. Close main() with `fragColor = COLOR;` so whatever the user
//      assigned to COLOR flows out.
//
// COLOR remains main-scope-only: helpers that need to mutate COLOR
// must take it as an `inout vec4` parameter. This is the one residual
// gotcha; documented in the Help library's "Helper functions" entry.

import {
  CONSTANTS,
  HELPER_SUBSTITUTION_MAP,
  LOCAL_BUILTINS,
  SUBSTITUTION_BUILTINS,
} from "./subset";
import type { HelperFunction, ParseSuccess, UniformDecl } from "./parser";

/** Source-map range — emitted-GLSL line N maps to user-source line
 *  N - (emittedStart - rawStart) when N is within
 *  [emittedStart, emittedStart + length). One range per body the user
 *  authored (each helper + the fragment body). */
export interface SourceMapRange {
  emittedStart: number;
  rawStart: number;
  length: number;
}

export interface EmitResult {
  /** Self-contained GLSL ES 3.00 fragment shader. */
  glsl: string;
  /** Sorted by emittedStart. Walk to map WebGL error lines back. */
  sourceMap: SourceMapRange[];
}

export function emitGlsl(parsed: ParseSuccess): EmitResult {
  const lines: string[] = [];
  const sourceMap: SourceMapRange[] = [];

  // --- Prelude ---
  lines.push("#version 300 es");
  lines.push("precision mediump float;");
  lines.push("");
  lines.push("in vec2 v_uv;");
  lines.push("out vec4 fragColor;");
  lines.push("");
  lines.push("uniform float u_time;");
  lines.push("uniform sampler2D u_texture;");
  lines.push("uniform vec2 u_texture_pixel_size;");
  lines.push("uniform vec2 u_resolution;");
  lines.push("");
  for (const c of CONSTANTS) {
    lines.push(`const float ${c.name} = ${c.value};`);
  }
  lines.push("");

  // --- User uniforms ---
  for (const u of parsed.uniforms) {
    lines.push(emitUniform(u));
  }
  if (parsed.uniforms.length > 0) lines.push("");

  // --- Helper functions ---
  // Each helper's body lines get a source-map range so WebGL compile
  // errors inside helpers point at the right user line. Built-in refs
  // in helper bodies get the broader HELPER_SUBSTITUTION_MAP
  // (TIME → u_time, UV → v_uv, etc.) since helpers can't see main's
  // local-built-ins.
  for (const fn of parsed.helpers) {
    emitHelper(lines, sourceMap, fn);
  }

  // --- main() ---
  lines.push("void main() {");
  for (const b of LOCAL_BUILTINS) {
    lines.push(`  ${b.type} ${b.name} = ${b.init};`);
  }

  const fragmentBodyEmittedStart = lines.length + 1;
  if (parsed.fragmentBody) {
    const rewritten = applyFragmentSubstitutions(parsed.fragmentBody);
    const fragmentLines = rewritten.split("\n");
    for (const ln of fragmentLines) {
      lines.push(ln);
    }
    sourceMap.push({
      emittedStart: fragmentBodyEmittedStart,
      rawStart: parsed.fragmentBodyStartLine,
      length: fragmentLines.length,
    });
  }

  lines.push("  fragColor = COLOR;");
  lines.push("}");

  return {
    glsl: lines.join("\n"),
    sourceMap,
  };
}

function emitUniform(u: UniformDecl): string {
  // Strip Godot-specific hint + default; GLSL just needs the type/name.
  return `uniform ${u.type} ${u.name};`;
}

function emitHelper(
  lines: string[],
  sourceMap: SourceMapRange[],
  fn: HelperFunction,
): void {
  lines.push(`${fn.signature} {`);
  const bodyEmittedStart = lines.length + 1;
  const rewritten = applyHelperSubstitutions(fn.body);
  const bodyLines = rewritten.split("\n");
  for (const ln of bodyLines) lines.push(ln);
  lines.push("}");
  lines.push("");
  sourceMap.push({
    emittedStart: bodyEmittedStart,
    rawStart: fn.bodyStartLine,
    length: bodyLines.length,
  });
}

// Fragment-body substitutions — narrow because main()'s locals already
// resolve TIME / UV / COLOR / etc. naturally. Only the things that
// CAN'T be locals (sampler types, the FragCoord keyword) substitute.
const FRAGMENT_SUBSTITUTION_RE = new RegExp(
  `\\b(${SUBSTITUTION_BUILTINS.map((b) => escapeRegExp(b.name)).join("|")})\\b`,
  "g",
);
const FRAGMENT_SUBSTITUTION_TABLE: Record<string, string> = Object.fromEntries(
  SUBSTITUTION_BUILTINS.map((b) => [b.name, b.replacement]),
);

function applyFragmentSubstitutions(source: string): string {
  return source.replace(
    FRAGMENT_SUBSTITUTION_RE,
    (m) => FRAGMENT_SUBSTITUTION_TABLE[m] ?? m,
  );
}

// Helper-body substitutions — broader. Helpers live at module scope so
// they can't see main()'s locals; we substitute every local-built-in's
// reference to its underlying uniform / varying expression. COLOR is
// deliberately excluded (no module-scope read-write equivalent in
// GLSL ES 3.00); helpers that need it must take it as `inout vec4`.
const HELPER_SUBSTITUTION_RE = new RegExp(
  `\\b(${[...HELPER_SUBSTITUTION_MAP.keys()].map(escapeRegExp).join("|")})\\b`,
  "g",
);

function applyHelperSubstitutions(source: string): string {
  return source.replace(
    HELPER_SUBSTITUTION_RE,
    (m) => HELPER_SUBSTITUTION_MAP.get(m) ?? m,
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Maps an emitted-GLSL line number (as reported by WebGL's compile error
 * log) back to the user's source-line number. Walks the per-body
 * source-map ranges to find the one containing the emitted line.
 *
 * Returns null for lines outside every range — those came from our
 * prelude or other emitter-injected code; surfacing them in the
 * editor's gutter would point at the wrong line, so we leave them
 * for the banner only.
 */
export function mapEmittedLineToUser(
  emittedLine: number,
  emit: EmitResult,
): number | null {
  for (const range of emit.sourceMap) {
    const end = range.emittedStart + range.length;
    if (emittedLine >= range.emittedStart && emittedLine < end) {
      return range.rawStart + (emittedLine - range.emittedStart);
    }
  }
  return null;
}
