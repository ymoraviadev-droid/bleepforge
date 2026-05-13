// Bleepforge-only shader metadata. The .gdshader file is the source of
// truth for the shader itself (text, uniforms, the GLSL); this module
// holds the side-info Bleepforge tracks ABOUT each shader that doesn't
// belong inside the Godot file — currently just the "pattern" the user
// picked to visually distinguish that shader's card in the gallery.
//
// Persisted as a single registry at `data/shaders/_meta.json`, keyed by
// the project-relative path of the .gdshader (e.g.
// `shared/shaders/scanlines.gdshader`). Bleepforge-only, never round-
// tripped to Godot — same shape as `data/dialogs/<folder>/_layout.json`
// (Bleepforge-only state colocated next to derived data).

import { z } from "zod";

// The 10 pattern variants the user can pick from. Each renders as a
// tiling SVG backdrop on the shader card + row. Order is the picker's
// display order; clients should treat this as the authoritative list
// (no separate label table — the client owns presentation).
export const SHADER_PATTERN_IDS = [
  "scanlines",
  "bars",
  "grid",
  "lattice",
  "diagonal",
  "waveform",
  "rings",
  "bricks",
  "circuit",
  "stars",
] as const;

export type ShaderPattern = (typeof SHADER_PATTERN_IDS)[number];

export const ShaderPatternSchema = z.enum(SHADER_PATTERN_IDS);

/** Side-info Bleepforge tracks about one .gdshader. Currently just the
 *  user-picked pattern; extensible — add fields here as future Bleepforge-
 *  only per-shader state lands (favorite flag, notes, etc.). */
export const ShaderMetaSchema = z.object({
  Pattern: ShaderPatternSchema,
});
export type ShaderMeta = z.infer<typeof ShaderMetaSchema>;

/** The full meta registry — Record keyed by project-relative shader path. */
export const ShaderMetaRegistrySchema = z.record(z.string(), ShaderMetaSchema);
export type ShaderMetaRegistry = z.infer<typeof ShaderMetaRegistrySchema>;
