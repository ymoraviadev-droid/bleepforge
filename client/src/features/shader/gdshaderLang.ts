// GDShader language extension for CodeMirror 6. Hand-rolled
// StreamLanguage rather than a full Lezer grammar — GDShader is a
// GLSL dialect, the token shapes are simple (keywords / types /
// numbers / strings / comments / identifiers), and StreamLanguage
// supports state for multi-line block comments. The full Lezer
// path would be ~10× the code for marginal extra accuracy on a
// hand-typed file.
//
// The Phase 3 translator (which lives in features/shader/translator/)
// will use its own structural parser — this module is for highlighting
// only and doesn't need to understand syntax errors or scope.

import {
  HighlightStyle,
  StreamLanguage,
  StringStream,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// Keywords from the Godot shader-language reference. Includes flow
// control + storage modifiers + the `shader_type` / `render_mode` /
// `group_uniforms` keywords specific to Godot.
const KEYWORDS = new Set([
  "shader_type",
  "render_mode",
  "group_uniforms",
  "uniform",
  "varying",
  "const",
  "in",
  "out",
  "inout",
  "void",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "break",
  "continue",
  "switch",
  "case",
  "default",
  "discard",
  "global",
  "instance",
  "true",
  "false",
]);

// Type keywords — GLSL scalar / vector / matrix / sampler types Godot
// supports in 4.x.
const TYPES = new Set([
  "bool",
  "int",
  "uint",
  "float",
  "double",
  "vec2",
  "vec3",
  "vec4",
  "ivec2",
  "ivec3",
  "ivec4",
  "uvec2",
  "uvec3",
  "uvec4",
  "bvec2",
  "bvec3",
  "bvec4",
  "mat2",
  "mat3",
  "mat4",
  "sampler2D",
  "samplerCube",
  "sampler2DArray",
  "samplerCubeArray",
  "isampler2D",
  "isampler2DArray",
  "isamplerCube",
  "usampler2D",
  "usampler2DArray",
  "usamplerCube",
  "sampler3D",
  "isampler3D",
  "usampler3D",
]);

// Shader-type values + canvas_item / spatial / particles / sky / fog
// render-mode values. Highlighted as types since they're keyword-like
// values appearing right after `shader_type` or `render_mode`.
const SHADER_TYPE_VALUES = new Set([
  "canvas_item",
  "spatial",
  "particles",
  "sky",
  "fog",
]);

// Godot's uniform hint annotations (the ` : hint_xxx` part of a uniform
// declaration). Highlighted as macros since they're directive-like.
const HINTS = new Set([
  "hint_range",
  "hint_color",
  "source_color",
  "hint_default_white",
  "hint_default_black",
  "hint_default_transparent",
  "hint_normal",
  "hint_roughness_normal",
  "hint_anisotropy",
  "hint_screen_texture",
  "hint_depth_texture",
  "hint_normal_roughness_texture",
  "filter_nearest",
  "filter_linear",
  "filter_nearest_mipmap",
  "filter_linear_mipmap",
  "repeat_enable",
  "repeat_disable",
  "instance_index",
]);

// Built-in functions + constants. Big set, but cheap to check — Map
// lookup, not iteration. Includes Godot-specific (`TIME`, `UV`, `COLOR`)
// + standard GLSL math/vector functions.
const BUILTINS = new Set([
  // Godot built-in inputs (canvas_item)
  "TIME",
  "UV",
  "SCREEN_UV",
  "COLOR",
  "TEXTURE",
  "TEXTURE_PIXEL_SIZE",
  "SCREEN_PIXEL_SIZE",
  "MODULATE",
  "POINT_COORD",
  "FRAGCOORD",
  "VERTEX",
  "INSTANCE_ID",
  "VERTEX_ID",
  // Godot built-in inputs (spatial)
  "ALBEDO",
  "ALPHA",
  "METALLIC",
  "ROUGHNESS",
  "EMISSION",
  "NORMAL",
  "NORMAL_MAP",
  "TANGENT",
  "BINORMAL",
  "SPECULAR",
  "AO",
  "RIM",
  // Matrices
  "MODELVIEW_MATRIX",
  "PROJECTION_MATRIX",
  "INV_PROJECTION_MATRIX",
  "MODEL_MATRIX",
  "VIEW_MATRIX",
  "INV_VIEW_MATRIX",
  "CANVAS_MATRIX",
  "SCREEN_MATRIX",
  // Constants
  "PI",
  "TAU",
  "E",
  // GLSL math
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "pow",
  "exp",
  "log",
  "exp2",
  "log2",
  "sqrt",
  "inversesqrt",
  "abs",
  "sign",
  "floor",
  "ceil",
  "fract",
  "mod",
  "min",
  "max",
  "clamp",
  "mix",
  "step",
  "smoothstep",
  "length",
  "distance",
  "dot",
  "cross",
  "normalize",
  "reflect",
  "refract",
  "round",
  "trunc",
  // Texture sampling
  "texture",
  "texelFetch",
  "textureLod",
  "textureGrad",
  "textureSize",
]);

interface State {
  inBlockComment: boolean;
}

const gdshader = StreamLanguage.define<State>({
  startState: () => ({ inBlockComment: false }),

  token(stream: StringStream, state: State): string | null {
    // Block comment continuation across lines.
    if (state.inBlockComment) {
      while (!stream.eol()) {
        if (stream.match("*/")) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }

    if (stream.eatSpace()) return null;

    // Line comment
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    // Block comment start
    if (stream.match("/*")) {
      state.inBlockComment = true;
      while (!stream.eol()) {
        if (stream.match("*/")) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }

    // String literal (Godot shaders don't really use these, but parse
    // safely just in case).
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";

    // Number literal. Order matters — try float (decimal or exponent)
    // before plain integer so 1.0 doesn't tokenize as `1` + `.0`.
    if (
      stream.match(/^\d+\.\d*(?:[eE][+-]?\d+)?[fF]?/) ||
      stream.match(/^\.\d+(?:[eE][+-]?\d+)?[fF]?/) ||
      stream.match(/^\d+[eE][+-]?\d+[fF]?/) ||
      stream.match(/^0[xX][0-9a-fA-F]+[uU]?/) ||
      stream.match(/^\d+[uU]?/)
    ) {
      return "number";
    }

    // Identifier / keyword
    const id = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      if (TYPES.has(word)) return "type";
      if (SHADER_TYPE_VALUES.has(word)) return "type";
      if (HINTS.has(word)) return "macroName";
      if (BUILTINS.has(word)) return "variableName.special";
      // ALL_CAPS-style identifiers tend to be more built-ins we didn't
      // enumerate — highlight them softly. Avoids dimming user-defined
      // uniform constants like `LINE_INTENSITY` though, so we keep it
      // conservative: only if all-caps + has at least one underscore
      // OR is at least 3 chars (avoiding most loop-variable noise).
      if (/^[A-Z][A-Z0-9_]+$/.test(word) && word.length >= 3) {
        return "variableName.special";
      }
      return "variableName";
    }

    // Punctuation / operators
    if (stream.match(/^[{}()[\];,.]/)) return "punctuation";
    if (stream.match(/^[+\-*/%=<>!&|^~?:]/)) return "operator";

    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    indentOnInput: /^\s*[{}]$/,
  },
});

// Theme-friendly highlight using semantic tag names. Colors match the
// rest of the Bleepforge UI — emerald-300 accents, lime for built-ins
// (the shader-surface color), amber for keywords, neutral-200 for
// regular identifiers. Lives as a HighlightStyle so it composes with
// the editor's base theme cleanly.
const gdshaderHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-amber-400)", fontWeight: "600" },
  { tag: tags.typeName, color: "var(--color-cyan-400)" },
  { tag: tags.comment, color: "var(--color-neutral-500)", fontStyle: "italic" },
  { tag: tags.string, color: "var(--color-emerald-400)" },
  { tag: tags.number, color: "var(--color-emerald-300)" },
  { tag: tags.macroName, color: "var(--color-fuchsia-400)" },
  { tag: tags.special(tags.variableName), color: "var(--color-lime-400)" },
  { tag: tags.variableName, color: "var(--color-neutral-200)" },
  { tag: tags.operator, color: "var(--color-neutral-400)" },
  { tag: tags.punctuation, color: "var(--color-neutral-500)" },
]);

/** Combined extension: language + highlight style. Plug this into the
 *  EditorView extensions array. */
export function gdshaderExtension(): Extension {
  return [gdshader, syntaxHighlighting(gdshaderHighlight)];
}
