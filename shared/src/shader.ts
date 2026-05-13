// Bleepforge-only shader metadata. The .gdshader file is the source of
// truth for the shader itself (text, uniforms, the GLSL); this module
// holds the side-info Bleepforge tracks ABOUT each shader that doesn't
// belong inside the Godot file — the "pattern" + "color" the user picked
// to visually distinguish that shader's card in the gallery.
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

// The 9 card-color overrides — mirrors the shared paletteColor.ts on the
// client. Picked from Tailwind palettes the theme system doesn't retint
// (only emerald/neutrals shift on theme swap), so the chosen color stays
// stable across every theme. Null means "use the shader_type's default
// tint" (canvas_item → lime, spatial → cyan, etc.).
export const SHADER_CARD_COLORS = [
  "emerald",
  "amber",
  "red",
  "blue",
  "violet",
  "cyan",
  "orange",
  "pink",
  "lime",
] as const;

export type ShaderCardColor = (typeof SHADER_CARD_COLORS)[number];

export const ShaderCardColorSchema = z.enum(SHADER_CARD_COLORS);

/** Side-info Bleepforge tracks about one .gdshader. Both fields are
 *  optional so a shader can carry a color override without a pattern (or
 *  vice versa) — pre-v0.2.1 entries that lack `Color` still parse, and a
 *  user can set just a color from a clean slate. `Color: null` is treated
 *  the same as field-absent: the card falls back to its shader_type tint.
 *  Extensible — add fields here as future Bleepforge-only per-shader
 *  state lands (favorite flag, notes, etc.). */
export const ShaderMetaSchema = z.object({
  Pattern: ShaderPatternSchema.optional(),
  Color: ShaderCardColorSchema.nullable().optional(),
});
export type ShaderMeta = z.infer<typeof ShaderMetaSchema>;

/** The full meta registry — Record keyed by project-relative shader path. */
export const ShaderMetaRegistrySchema = z.record(z.string(), ShaderMetaSchema);
export type ShaderMetaRegistry = z.infer<typeof ShaderMetaRegistrySchema>;
