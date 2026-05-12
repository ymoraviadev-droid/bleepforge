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
 *  sampler2D is supported: each user sampler gets its own AssetPicker
 *  in the uniform controls and binds to a dedicated WebGL2 texture
 *  unit (unit 0 stays reserved for the built-in TEXTURE → u_texture).
 *  Runtime caps at the GL's MAX_COMBINED_TEXTURE_IMAGE_UNITS (32+ in
 *  practice) — far past anything a user would author. */
export const SUPPORTED_UNIFORM_TYPES: readonly string[] = [
  "bool",
  "int",
  "float",
  "vec2",
  "vec3",
  "vec4",
  "sampler2D",
];

/** Hint annotations the translator recognizes — split by what they
 *  drive in the UI vs. what they drive at the runtime level. A uniform
 *  may carry at most ONE UI hint, and any number of sampler hints
 *  (Godot's comma-separated `: filter_linear, repeat_enable` syntax).
 *
 *  UI_HINTS shape the auto-generated control (slider for hint_range,
 *  color picker for source_color / hint_color). Only valid on
 *  scalar / vector / float uniforms.
 *
 *  SAMPLER_HINTS only valid on sampler2D uniforms. filter_* and
 *  repeat_* drive `texParameteri` calls when the runtime uploads the
 *  texture. hint_screen_texture flags the sampler as "the rendered
 *  scene behind the shader" — in Godot that's a framebuffer copy; in
 *  the Bleepforge preview the runtime aliases it to texture unit 0
 *  (the same image the main TEXTURE picker drives) so post-process
 *  shaders can be authored against Godot's native syntax and
 *  previewed against a representative screenshot.
 *
 *  hint_previous_frame is Bleepforge-specific: flags the sampler as
 *  "the previous frame's rendered output." The runtime ping-pongs
 *  two framebuffers so iterative effects (trails, feedback loops,
 *  decay echoes) work natively. Godot doesn't recognize this hint —
 *  for Godot deployment, comment-toggle or wire a SubViewport
 *  ping-pong manually. */
export const UI_HINTS: readonly string[] = [
  "hint_range",
  "hint_color",
  "source_color",
];

export const SAMPLER_HINTS: readonly string[] = [
  "filter_nearest",
  "filter_linear",
  "filter_nearest_mipmap",
  "filter_linear_mipmap",
  "repeat_enable",
  "repeat_disable",
  "hint_screen_texture",
  "hint_previous_frame",
];

/** Combined set for the parser's existing validation pass — anything
 *  that isn't in this union is rejected as unsupported. */
export const SUPPORTED_HINTS: readonly string[] = [
  ...UI_HINTS,
  ...SAMPLER_HINTS,
];

/** Sentinel for sampler-hint inspection at the runtime layer. */
export const HINT_SCREEN_TEXTURE = "hint_screen_texture";

/** Bleepforge-specific hint: bind this sampler2D to the previous
 *  frame's rendered output (ping-pong framebuffer). Lets users author
 *  trail / iterative-blend effects against a stable sampler name.
 *  Godot doesn't recognize this hint natively — for Godot deployment,
 *  comment-toggle it OR set up SubViewport ping-pong manually and
 *  bind the same uniform name there. */
export const HINT_PREVIOUS_FRAME = "hint_previous_frame";

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

// Substitutions emitter applies to **helper function bodies** (user-
// defined functions other than fragment()). Helpers live at module
// scope, so they can't see main()'s local-built-ins — but they CAN
// see the underlying uniforms / varyings that those locals are
// initialized from. Substituting `UV → v_uv`, `TIME → u_time`, etc.
// in helper bodies makes the natural-looking user code "Just Work"
// without forcing every helper to take a long parameter list.
//
// COLOR is the lone exception: it's read-write per-fragment and there's
// no module-scope equivalent in GLSL ES 3.00. Helpers that need to
// write COLOR must take it as an `inout vec4` parameter. Helpers that
// only read a final color can return one and let main() assign.
//
// Each replacement is wrapped in parens when it's a compound
// expression (anything that isn't a bare identifier) so that user
// arithmetic like `1.0 / SCREEN_PIXEL_SIZE` substitutes safely without
// operator-precedence surprises.
const HELPER_BODY_SUBSTITUTIONS_ENTRIES: Array<[string, string]> = [
  // Existing substitution-built-ins (also apply in helpers).
  ...SUBSTITUTION_BUILTINS.map((b) => [b.name, b.replacement] as [string, string]),
  // Local-built-ins from main() get rewired to their underlying source.
  // COLOR is omitted on purpose — see comment above.
  ...LOCAL_BUILTINS.filter((b) => b.name !== "COLOR").map(
    (b) => [b.name, wrapIfCompound(b.init)] as [string, string],
  ),
];

export const HELPER_SUBSTITUTION_MAP: ReadonlyMap<string, string> = new Map(
  HELPER_BODY_SUBSTITUTIONS_ENTRIES,
);

function wrapIfCompound(s: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) ? s : `(${s})`;
}

/** Names the emitter injects into the GLSL prelude or top-level scope.
 *  User uniforms can't reuse these names — the emitted source would
 *  carry two `uniform sampler2D u_texture;` declarations or shadow a
 *  built-in local with a different type, and the WebGL compiler error
 *  ("redeclaration of u_texture") wouldn't point the user at the right
 *  fix. Better to reject at parse time with a specific message. */
export const RESERVED_UNIFORM_NAMES: ReadonlySet<string> = new Set([
  // Auto-injected uniforms (prelude)
  "u_time",
  "u_texture",
  "u_texture_pixel_size",
  "u_resolution",
  // Varyings + output
  "v_uv",
  "fragColor",
  // Local-built-in names (declared in main())
  ...LOCAL_BUILTIN_NAMES,
  // Substitution-built-in names (rewritten in user source)
  ...SUBSTITUTION_BUILTIN_MAP.keys(),
  // Math constants
  ...CONSTANT_NAMES,
  // The entry point
  "main",
]);
