// Display formatters + visual theme bits shared across the shader card,
// row, and edit page. Per-shader_type color is stable across themes
// (uses Tailwind palettes outside the theme system's emerald/neutral
// retint), so canvas_item is always lime, spatial always cyan, etc.

import type { ShaderType } from "../../lib/api";

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

// Scanline overlay for the card thumbnail area — same recipe the dialog
// graph's Terminal nodes use, just resolved through a fixed lime tint
// since shader cards don't theme-retint per node. Sells "this is a
// shader, not generic UI" at a glance without needing custom art.
export const SCANLINE_OVERLAY_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, rgba(132, 204, 22, 0.08) 0 1px, transparent 1px 3px)",
};

export function buildShaderEditUrl(path: string): string {
  return `/shaders/edit?path=${encodeURIComponent(path)}`;
}
