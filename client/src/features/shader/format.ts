// Display formatters + visual theme bits shared across the shader card,
// row, and edit page. Per-shader_type color is stable across themes
// (uses Tailwind palettes outside the theme system's emerald/neutral
// retint), so canvas_item is always lime, spatial always cyan, etc.
//
// Each shader can ALSO carry a per-shader color override (set via the
// card-color picker on the New/Edit forms). When set, the override
// replaces the shader_type tint everywhere the card chrome reads from
// `shaderCardStyle` — the same one helper feeds the list card, list
// row, and edit page metadata bar so all three retint together.

import type { ShaderAsset, ShaderType } from "../../lib/api";
import type { ShaderCardColor } from "@bleepforge/shared";

export { fmtBytes } from "../asset/format";

export interface ShaderTypeStyle {
  /** Top-area background fill class. */
  bg: string;
  /** Border accent class. */
  border: string;
  /** Text color used for the shader_type chip label. */
  text: string;
}

const UNKNOWN_STYLE: ShaderTypeStyle = {
  bg: "bg-neutral-900",
  border: "border-neutral-700",
  text: "text-neutral-300",
};

// canvas_item shares the kind-badge palette (lime) so the surface reads
// as one coherent visual category — Ctrl+K search row, list card,
// usages panel all land on the same hue. spatial / particles / sky /
// fog get distinct hues so when the corpus grows past 2D the user can
// tell type at a glance. Picked from palettes the theme system doesn't
// retint (only emerald / neutrals shift on theme swap), so the mapping
// stays stable.
const STYLES: Record<ShaderType, ShaderTypeStyle> = {
  canvas_item: {
    bg: "bg-lime-950/40",
    border: "border-lime-800/60",
    text: "text-lime-300",
  },
  spatial: {
    bg: "bg-cyan-950/40",
    border: "border-cyan-800/60",
    text: "text-cyan-300",
  },
  particles: {
    bg: "bg-orange-950/40",
    border: "border-orange-800/60",
    text: "text-orange-300",
  },
  sky: {
    bg: "bg-blue-950/40",
    border: "border-blue-800/60",
    text: "text-blue-300",
  },
  fog: {
    bg: "bg-slate-900/50",
    border: "border-slate-700/60",
    text: "text-slate-300",
  },
};

export function shaderTypeStyle(t: ShaderType | null): ShaderTypeStyle {
  return t ? STYLES[t] : UNKNOWN_STYLE;
}

export function shaderTypeLabel(t: ShaderType | null): string {
  return t ?? "unknown";
}

// Per-shader color overrides. Mirrors the 9 palettes the shared
// paletteColor.ts helper exposes, but the class strings here use the
// same bg-{c}-950/40 + border-{c}-800/60 + text-{c}-300 shape the
// shader_type styles already use (so a recolored card reads identical
// in weight to a default-tinted one, just in the picked hue). Spelled
// out as literals because Tailwind's compile-time scanner can't follow
// dynamic concatenation.
const COLOR_STYLES: Record<ShaderCardColor, ShaderTypeStyle> = {
  emerald: { bg: "bg-emerald-950/40", border: "border-emerald-800/60", text: "text-emerald-300" },
  amber: { bg: "bg-amber-950/40", border: "border-amber-800/60", text: "text-amber-300" },
  red: { bg: "bg-red-950/40", border: "border-red-800/60", text: "text-red-300" },
  blue: { bg: "bg-blue-950/40", border: "border-blue-800/60", text: "text-blue-300" },
  violet: { bg: "bg-violet-950/40", border: "border-violet-800/60", text: "text-violet-300" },
  cyan: { bg: "bg-cyan-950/40", border: "border-cyan-800/60", text: "text-cyan-300" },
  orange: { bg: "bg-orange-950/40", border: "border-orange-800/60", text: "text-orange-300" },
  pink: { bg: "bg-pink-950/40", border: "border-pink-800/60", text: "text-pink-300" },
  lime: { bg: "bg-lime-950/40", border: "border-lime-800/60", text: "text-lime-300" },
};

export function shaderColorStyle(c: ShaderCardColor): ShaderTypeStyle {
  return COLOR_STYLES[c];
}

/** Single source of truth for the card backdrop tint. Picked color
 *  override wins; otherwise we fall back to the shader_type tint.
 *  ShaderCard, ShaderRow, and the Edit page's metadata bar all read
 *  through this so the three surfaces retint in lockstep. */
export function shaderCardStyle(asset: ShaderAsset): ShaderTypeStyle {
  if (asset.color) return COLOR_STYLES[asset.color];
  return shaderTypeStyle(asset.shaderType);
}

// Hex tint feed for the PatternPicker preview swatches — pattern SVGs
// render via `currentColor` so the picker needs a plain CSS color
// string, not a Tailwind class. Maps to Tailwind's -400 stop per color
// (matches the dot weight in ColorPicker so preview ↔ swatch ↔ card
// all read at the same intensity). Shader_type fallbacks mirror the
// canvas_item/spatial/etc. tints elsewhere on the surface.
const COLOR_HEX: Record<ShaderCardColor, string> = {
  emerald: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  blue: "#60a5fa",
  violet: "#a78bfa",
  cyan: "#22d3ee",
  orange: "#fb923c",
  pink: "#f472b6",
  lime: "#a3e635",
};

const TYPE_HEX: Record<ShaderType, string> = {
  canvas_item: "#a3e635", // lime-400
  spatial: "#22d3ee", // cyan-400
  particles: "#fb923c", // orange-400
  sky: "#60a5fa", // blue-400
  fog: "#94a3b8", // slate-400
};

const UNKNOWN_HEX = "#a3a3a3"; // neutral-400

/** Plain hex tint for previews that need a CSS color string (the
 *  PatternPicker's per-swatch `color` prop). Picked color override wins;
 *  otherwise the shader_type's hex; otherwise neutral. */
export function shaderPreviewTint(
  color: ShaderCardColor | null,
  shaderType: ShaderType | null,
): string {
  if (color) return COLOR_HEX[color];
  if (shaderType) return TYPE_HEX[shaderType];
  return UNKNOWN_HEX;
}

// Scanline overlay for the card thumbnail area — same recipe the dialog
// graph's Terminal nodes use, just resolved through a fixed lime tint
// since shader cards don't theme-retint per node. Sells "this is a
// shader, not generic UI" at a glance without needing custom art.
//
// Kept for back-compat / future surfaces; cards now render their per-
// shader PatternBackdrop instead of a fixed scanline overlay.
export const SCANLINE_OVERLAY_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, rgba(132, 204, 22, 0.08) 0 1px, transparent 1px 3px)",
};

export function buildShaderEditUrl(path: string): string {
  return `/shaders/edit?path=${encodeURIComponent(path)}`;
}

// User-facing display name for a shader: filename without the
// `.gdshader` extension. The extension is implementation detail —
// "scanlines" is what the user thinks of as the shader's name,
// "scanlines.gdshader" is how Godot stores it on disk. Used as the
// headline label on cards + the main label on rows.
export function shaderDisplayName(basename: string): string {
  return basename.endsWith(".gdshader")
    ? basename.slice(0, -".gdshader".length)
    : basename;
}
