// GDShader → GLSL ES 3.00 emitter. Consumes a ParseSuccess from
// parser.ts and produces a self-contained GLSL fragment shader plus a
// source map fragment-body line ↔ emitted line so the runtime can map
// WebGL compile errors back to lines the user can find in their editor.
//
// The translation strategy is deliberately mechanical:
//   1. Emit a fixed prelude (precision, varyings, our injected uniforms,
//      math constants).
//   2. Emit each user uniform stripped of its Godot-specific hint +
//      default (GLSL has no place for those — they're UI metadata).
//   3. Open `void main()`, declare every local-built-in
//      (TIME / UV / COLOR / ...) as a `<type> name = <init>` line so
//      the user's body sees them as plain variables.
//   4. Splice the user's fragment() body verbatim, with two token
//      substitutions: TEXTURE → u_texture, FRAGCOORD → gl_FragCoord.
//   5. Close main() with `fragColor = COLOR;` so whatever the user
//      assigned to COLOR flows out.
//
// What this CAN'T do: helper functions that reference local-built-ins
// (since those are locals in main()). Helpers must take built-ins as
// parameters, the same way idiomatic GLSL works. Documented in the
// "live preview" Help entry that lands with the Phase 3 docs.

import {
  CONSTANTS,
  LOCAL_BUILTINS,
  SUBSTITUTION_BUILTINS,
} from "./subset";
import type { ParseSuccess, UniformDecl } from "./parser";

export interface EmitResult {
  /** Self-contained GLSL ES 3.00 fragment shader. */
  glsl: string;
  /** GLSL line number of the FIRST line of the user's fragment() body,
   *  so the runtime can subtract this from a WebGL error line to map
   *  back to the user-source line. Zero when no fragment() body was
   *  parsed (the emitted main() is just the boilerplate then). */
  bodyEmittedLine: number;
  /** Corresponding line in the user's raw source. Pairs with
   *  bodyEmittedLine to produce the mapping
   *    userLine = (emittedLine - bodyEmittedLine) + rawBodyStartLine. */
  bodyRawStartLine: number;
}

export function emitGlsl(parsed: ParseSuccess): EmitResult {
  const lines: string[] = [];

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

  // --- main() ---
  lines.push("void main() {");
  for (const b of LOCAL_BUILTINS) {
    lines.push(`  ${b.type} ${b.name} = ${b.init};`);
  }

  // Body — the line just AFTER the local-built-in block is where the
  // user's source resumes. Track that line for the source map.
  const bodyEmittedLine = lines.length + 1;

  if (parsed.fragmentBody) {
    const rewritten = applySubstitutions(parsed.fragmentBody);
    // Splice user lines preserving their original \n structure so the
    // line map is 1:1 within the body. We deliberately do NOT re-indent.
    for (const ln of rewritten.split("\n")) {
      lines.push(ln);
    }
  }

  lines.push("  fragColor = COLOR;");
  lines.push("}");

  return {
    glsl: lines.join("\n"),
    bodyEmittedLine,
    bodyRawStartLine: parsed.fragmentBodyStartLine,
  };
}

function emitUniform(u: UniformDecl): string {
  // Strip Godot-specific hint + default; GLSL just needs the type/name.
  return `uniform ${u.type} ${u.name};`;
}

// Whole-word substitutions for built-ins that can't be locals.
// Compiled once at module load.
const SUBSTITUTION_RE = new RegExp(
  `\\b(${SUBSTITUTION_BUILTINS.map((b) => escapeRegExp(b.name)).join("|")})\\b`,
  "g",
);

const SUBSTITUTION_TABLE: Record<string, string> = Object.fromEntries(
  SUBSTITUTION_BUILTINS.map((b) => [b.name, b.replacement]),
);

function applySubstitutions(source: string): string {
  return source.replace(SUBSTITUTION_RE, (m) => SUBSTITUTION_TABLE[m] ?? m);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Maps an emitted-GLSL line number (as reported by WebGL's compile error
 * log) back to the user's source-line number. Useful when the runtime
 * surfaces compile errors in the editor.
 *
 * Lines emitted before bodyEmittedLine come from our prelude or user
 * uniform block; we can't map those to a specific user-source line
 * meaningfully (the uniforms come from individual user lines but the
 * emitter doesn't track each one), so we return null there. Lines at or
 * after bodyEmittedLine map linearly to user-source lines.
 */
export function mapEmittedLineToUser(
  emittedLine: number,
  emit: EmitResult,
): number | null {
  if (emittedLine < emit.bodyEmittedLine || emit.bodyRawStartLine === 0) {
    return null;
  }
  return emittedLine - emit.bodyEmittedLine + emit.bodyRawStartLine;
}
