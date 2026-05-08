import type { CodexColor } from "@bleepforge/shared";

// Per-category color → Tailwind class strings. Spelled out as literals
// because Tailwind's compile-time scanner can't follow dynamic
// concatenation — `border-${color}-600` would be silently stripped from
// the production CSS.
//
// The eight names match shared/src/codex.ts CODEX_COLORS exactly. If a
// new color is added there, this map must grow too — TypeScript will
// flag the missing key on build.

interface ColorClassSet {
  /** Section header text + a card's accent stripe. */
  text: string;
  /** Card border in default state. */
  border: string;
  /** Card border on hover. */
  borderHover: string;
  /** Background tint for the small "(category)" badge on cards. */
  bgTint: string;
  /** A 2px accent stripe atop a card. */
  stripe: string;
  /** A small swatch chip used in the color picker. */
  swatch: string;
}

const STYLES: Record<CodexColor, ColorClassSet> = {
  emerald: {
    text: "text-emerald-300",
    border: "border-emerald-700/60",
    borderHover: "hover:border-emerald-500",
    bgTint: "bg-emerald-950/40",
    stripe: "bg-emerald-600",
    swatch: "bg-emerald-500",
  },
  amber: {
    text: "text-amber-300",
    border: "border-amber-700/60",
    borderHover: "hover:border-amber-500",
    bgTint: "bg-amber-950/40",
    stripe: "bg-amber-600",
    swatch: "bg-amber-500",
  },
  red: {
    text: "text-red-300",
    border: "border-red-700/60",
    borderHover: "hover:border-red-500",
    bgTint: "bg-red-950/40",
    stripe: "bg-red-600",
    swatch: "bg-red-500",
  },
  blue: {
    text: "text-blue-300",
    border: "border-blue-700/60",
    borderHover: "hover:border-blue-500",
    bgTint: "bg-blue-950/40",
    stripe: "bg-blue-600",
    swatch: "bg-blue-500",
  },
  violet: {
    text: "text-violet-300",
    border: "border-violet-700/60",
    borderHover: "hover:border-violet-500",
    bgTint: "bg-violet-950/40",
    stripe: "bg-violet-600",
    swatch: "bg-violet-500",
  },
  cyan: {
    text: "text-cyan-300",
    border: "border-cyan-700/60",
    borderHover: "hover:border-cyan-500",
    bgTint: "bg-cyan-950/40",
    stripe: "bg-cyan-600",
    swatch: "bg-cyan-500",
  },
  orange: {
    text: "text-orange-300",
    border: "border-orange-700/60",
    borderHover: "hover:border-orange-500",
    bgTint: "bg-orange-950/40",
    stripe: "bg-orange-600",
    swatch: "bg-orange-500",
  },
  pink: {
    text: "text-pink-300",
    border: "border-pink-700/60",
    borderHover: "hover:border-pink-500",
    bgTint: "bg-pink-950/40",
    stripe: "bg-pink-600",
    swatch: "bg-pink-500",
  },
};

export function categoryColorClasses(color: CodexColor): ColorClassSet {
  return STYLES[color] ?? STYLES.emerald;
}
