// The translator's spec: which GDShader features land in the v1 subset
// and how each one maps into the emitted GLSL ES 3.00. parser.ts uses
// this to validate; emit.ts uses it to construct the prelude + body
// rewrites. Keeping the registry centralized so the two passes can't
// drift — if you add a built-in, you add it here and both passes pick
// it up automatically.

/** Built-ins that get emitted as LOCAL variables at the top of main().
 *  User-source references to them are NOT rewritten — they just resolve
 *  to the local. Works for anything whose GLSL ES 3.00 type allows local
 *  declarations (everything except sampler types). */
export interface LocalBuiltin {
  /** Identifier as written in GDShader source ("TIME", "UV", "COLOR"). */
  name: string;
  /** Emitted GLSL type. */
  type: "float" | "int" | "vec2" | "vec3" | "vec4";
  /** Right-hand-side expression — typically a uniform reference, a
   *  varying reference, or a constant. */
  init: string;
}

/** Built-ins that get emitted as TOKEN SUBSTITUTIONS in the user's
 *  source. Used for things that can't be local variables (sampler types)
 *  or for cases where we want the runtime value to flow through a real
 *  uniform/keyword reference (gl_FragCoord, gl_PointCoord). */
export interface SubstitutionBuiltin {
  /** Identifier as written in GDShader source. */
  name: string;
  /** Replacement token (emitted verbatim wherever `name` appears). */
  replacement: string;
}

/** GDShader built-ins whose type permits a local declaration — the
 *  emitter declares each as `<type> <name> = <init>;` at the top of
 *  main(), so user references resolve naturally. COLOR is special: its
 *  value at the end of main() flows back to fragColor (Godot's output
 *  convention), so it doubles as an in-out variable. */
export const LOCAL_BUILTINS: readonly LocalBuiltin[] = [
  { name: "TIME", type: "float", init: "u_time" },
  { name: "UV", type: "vec2", init: "v_uv" },
  { name: "SCREEN_UV", type: "vec2", init: "v_uv" },
  // Canvas-item COLOR is initialized from the vertex stage's per-vertex
  // color. We stub it to white for now (no per-vertex colors on the
  // preview's full-screen quad); when the user samples TEXTURE they
  // overwrite COLOR anyway, which is the common case.
  { name: "COLOR", type: "vec4", init: "vec4(1.0)" },
  { name: "MODULATE", type: "vec4", init: "vec4(1.0)" },
  { name: "TEXTURE_PIXEL_SIZE", type: "vec2", init: "u_texture_pixel_size" },
  { name: "SCREEN_PIXEL_SIZE", type: "vec2", init: "1.0 / u_resolution" },
];

/** GDShader built-ins that translate to a token substitution. TEXTURE
 *  has to be a substitution rather than a local because sampler2D can't
 *  be assigned to a local variable in GLSL ES 3.00. FRAGCOORD goes
 *  through substitution to avoid declaring a local that shadows
 *  gl_FragCoord (cleaner emitted GLSL). */
export const SUBSTITUTION_BUILTINS: readonly SubstitutionBuiltin[] = [
  { name: "TEXTURE", replacement: "u_texture" },
  { name: "FRAGCOORD", replacement: "gl_FragCoord" },
];

/** Mathematical constants Godot exposes that GLSL doesn't have built-in.
 *  Emitted as top-level `const float`s in the prelude. */
export const CONSTANTS: readonly { name: string; value: string }[] = [
  { name: "PI", value: "3.141592653589793" },
  { name: "TAU", value: "6.283185307179586" },
  { name: "E", value: "2.718281828459045" },
];

/** Uniform types the translator recognizes in `uniform <type> <name>;`
 *  declarations. Anything else is rejected with a clear message.
 *
 *  Note: sampler2D is NOT in this set in v1. The built-in `TEXTURE`
 *  built-in maps to a single sampler2D (u_texture) that the user picks
 *  via AssetPicker; additional sampler2D uniforms aren't bound to
 *  anything, so accepting them would compile but render with garbage
 *  data. Surfacing as an unsupported-type error keeps the failure mode
 *  honest. */
export const SUPPORTED_UNIFORM_TYPES: readonly string[] = [
  "bool",
  "int",
  "float",
  "vec2",
  "vec3",
  "vec4",
];

/** Hint annotations the translator recognizes inside uniform
 *  declarations. The annotations themselves are stripped from the
 *  emitted GLSL (they're a Godot-specific concept); we just use them
 *  for UI control generation (slider ranges, color pickers, etc.). */
export const SUPPORTED_HINTS: readonly string[] = [
  "hint_range",
  "hint_color",
  "source_color",
];

/** Features we refuse with a clear error message. Each entry pairs a
 *  source-text needle (matched against tokens — see parser.ts) with a
 *  human-readable reason so the user knows why the preview is dark. */
export interface BannedFeature {
  /** Token or token sequence to match. Joined with " " when multiple. */
  match: string;
  reason: string;
}

export const BANNED_FEATURES: readonly BannedFeature[] = [
  {
    match: "varying",
    reason:
      "varying declarations are out of v1 scope — we only run the fragment stage on a full-screen quad. Move per-fragment values into uniforms or constants.",
  },
  {
    match: "hint_screen_texture",
    reason:
      "hint_screen_texture needs a framebuffer copy of the scene behind the shader, which the preview canvas doesn't have. Sample u_texture / TEXTURE instead.",
  },
  {
    match: "hint_depth_texture",
    reason:
      "hint_depth_texture requires a depth buffer from a 3D scene, which canvas_item shaders running on the preview canvas don't have.",
  },
  {
    match: "hint_normal_roughness_texture",
    reason: "Normal/roughness textures are a 3D concept — canvas_item preview can't supply them.",
  },
  {
    match: "#include",
    reason:
      "#include directives are out of v1 scope. Inline the helper code or wait for translator Phase 4.",
  },
];

/** shader_type values we support. Anything else trips the translator
 *  with a "live preview unsupported" pane on the edit page. */
export const SUPPORTED_SHADER_TYPES: readonly string[] = ["canvas_item"];

// Convenience lookups built once at module load. Cheaper than scanning
// the arrays on every token check.
export const LOCAL_BUILTIN_NAMES: ReadonlySet<string> = new Set(
  LOCAL_BUILTINS.map((b) => b.name),
);
export const SUBSTITUTION_BUILTIN_MAP: ReadonlyMap<string, string> = new Map(
  SUBSTITUTION_BUILTINS.map((b) => [b.name, b.replacement]),
);
export const CONSTANT_NAMES: ReadonlySet<string> = new Set(
  CONSTANTS.map((c) => c.name),
);
