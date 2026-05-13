// Per-theme color-override runtime. Built-in themes are CSS-only blocks
// at `[data-theme="X"]`; this module overrides individual variables via
// inline-style on `<html>` (which beats the CSS block by specificity)
// when the active GlobalTheme carries a `colorOverrides` field.
//
// The 11 stops of `accent` and `neutral` derive from a single picked
// color via CSS `color-mix(in oklch, white|black, picked)` — the browser
// does the math lazily at render-time, so we set 11 setProperty calls
// per palette without computing any colors in JS. Approximate to
// Tailwind's hand-tuned ladders but close enough for a fork-a-builtin
// UX; user can always pick a base color that lands their preferred
// 500-stop and the other 10 follow.

import type { ColorOverrides } from "@bleepforge/shared";

// Lightness ladder per stop — mix percentages chosen so that the
// resulting palette has a coherent dark/light progression similar to
// Tailwind v4's emerald/neutral. Tuned by eye, not perfect, but
// predictable: 500 = the picked color exactly; lighter stops mix with
// white in increasing amounts toward 50; darker stops mix with black
// in increasing amounts toward 950.
const LADDER: Array<{ stop: number; mix: string }> = [
  // Lighter stops — mix with white.
  { stop: 50, mix: "color-mix(in oklch, white 92%, var(--__bf-base) 8%)" },
  { stop: 100, mix: "color-mix(in oklch, white 84%, var(--__bf-base) 16%)" },
  { stop: 200, mix: "color-mix(in oklch, white 65%, var(--__bf-base) 35%)" },
  { stop: 300, mix: "color-mix(in oklch, white 45%, var(--__bf-base) 55%)" },
  { stop: 400, mix: "color-mix(in oklch, white 22%, var(--__bf-base) 78%)" },
  // 500 = picked color exactly.
  { stop: 500, mix: "var(--__bf-base)" },
  // Darker stops — mix with black.
  { stop: 600, mix: "color-mix(in oklch, black 18%, var(--__bf-base) 82%)" },
  { stop: 700, mix: "color-mix(in oklch, black 35%, var(--__bf-base) 65%)" },
  { stop: 800, mix: "color-mix(in oklch, black 52%, var(--__bf-base) 48%)" },
  { stop: 900, mix: "color-mix(in oklch, black 68%, var(--__bf-base) 32%)" },
  { stop: 950, mix: "color-mix(in oklch, black 82%, var(--__bf-base) 18%)" },
];

// Per-palette intermediate variable name used to anchor the color-mix
// expressions. We can't inline the base color into every mix expression
// because that would mean recomputing it 11 times per render-frame; the
// browser resolves `var(--__bf-base)` once per element instead. One
// scratch var per palette so the ladders don't collide.
const SCRATCH = {
  accent: "--__bf-base-accent",
  neutral: "--__bf-base-neutral",
  sourceNpc: "--__bf-base-source-npc",
  sourceTerminal: "--__bf-base-source-terminal",
  choice: "--__bf-base-choice",
} as const;

// Each ladder uses the same per-stop mix percentages but writes to a
// different CSS variable family. Tailwind names emerald/neutral; the
// three dialog-graph palettes have their own --color-source-npc-* etc.
type LadderTarget =
  | { kind: "tailwind"; family: "emerald" | "neutral" }
  | { kind: "custom"; prefix: string };

/** Apply `overrides` to the document root via inline setProperty. Missing
 *  fields are cleared so toggling overrides off restores the built-in's
 *  CSS-block defaults. Safe to call repeatedly. */
export function applyColorOverrides(
  overrides: ColorOverrides | undefined,
): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;

  applyLadder(el, "accent", { kind: "tailwind", family: "emerald" }, overrides?.accent);
  applyLadder(el, "neutral", { kind: "tailwind", family: "neutral" }, overrides?.neutral);
  applyLadder(el, "sourceNpc", { kind: "custom", prefix: "--color-source-npc-" }, overrides?.sourceNpc);
  applyLadder(el, "sourceTerminal", { kind: "custom", prefix: "--color-source-terminal-" }, overrides?.sourceTerminal);
  applyLadder(el, "choice", { kind: "custom", prefix: "--color-choice-" }, overrides?.choice);

  if (overrides?.canvasBg) {
    el.style.setProperty("--canvas-bg", overrides.canvasBg);
  } else {
    el.style.removeProperty("--canvas-bg");
  }

  if (overrides?.canvasPattern) {
    el.style.setProperty("--canvas-pattern", overrides.canvasPattern);
  } else {
    el.style.removeProperty("--canvas-pattern");
  }
}

function ladderVarName(target: LadderTarget, stop: number): string {
  if (target.kind === "tailwind") return `--color-${target.family}-${stop}`;
  return `${target.prefix}${stop}`;
}

// ---- CSS-color → hex resolver ----------------------------------------------
// `<input type="color">` only accepts hex (#RRGGBB). The CSS variables in
// our themes resolve to `oklch(...)` strings, which the input can't take.
// Instead of writing an OKLch→sRGB converter in JS, we delegate to the
// browser's own color parser: paint the CSS color onto a 1×1 canvas, read
// the pixel back as sRGB triplets, format as hex. Works for any CSS color
// string the browser understands (oklch, hsl, rgb, hex, color-mix, named).

let resolveCanvas: HTMLCanvasElement | null = null;
let resolveCtx: CanvasRenderingContext2D | null = null;

function ensureResolver(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (resolveCtx) return resolveCtx;
  resolveCanvas = document.createElement("canvas");
  resolveCanvas.width = 1;
  resolveCanvas.height = 1;
  resolveCtx = resolveCanvas.getContext("2d", { willReadFrequently: true });
  return resolveCtx;
}

/** Convert any CSS color string to a #RRGGBB hex via 1×1 canvas. Returns
 *  `#000000` when the browser can't parse the input (which only happens
 *  for malformed strings — empty string, garbage, etc.). */
export function cssColorToHex(css: string): string {
  const ctx = ensureResolver();
  if (!ctx) return "#000000";
  // Reset to a sentinel so a parse failure on the next assignment leaves
  // it visible (canvas2d silently ignores invalid colors).
  ctx.fillStyle = "#000000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(r ?? 0)}${hex(g ?? 0)}${hex(b ?? 0)}`;
}

/** Read the document root's current value for a CSS custom property and
 *  resolve it to a #RRGGBB hex. Used by the Preferences theme editor so
 *  each color picker shows the active theme's current effective value
 *  (whether that came from the built-in's CSS block or from an existing
 *  override). Returns null when document isn't available. */
export function readVarAsHex(varName: string): string | null {
  if (typeof document === "undefined") return null;
  const css = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!css) return null;
  return cssColorToHex(css);
}

function applyLadder(
  el: HTMLElement,
  scratchKey: keyof typeof SCRATCH,
  target: LadderTarget,
  base: string | undefined,
): void {
  const scratchVar = SCRATCH[scratchKey];
  if (!base) {
    // Clear the scratch + every stop. Removing scratch breaks the
    // `var(--__bf-base)` references in any leftover mix expressions
    // and the CSS-block defaults take over.
    el.style.removeProperty(scratchVar);
    for (const { stop } of LADDER) {
      el.style.removeProperty(ladderVarName(target, stop));
    }
    return;
  }
  // Set the scratch var FIRST, then each stop's color-mix expression
  // references it. The `var(--__bf-base-*)` reference in our LADDER
  // template string uses the literal name `--__bf-base`, so we re-write
  // each mix here to substitute the actual scratch var name.
  el.style.setProperty(scratchVar, base);
  for (const { stop, mix } of LADDER) {
    const expr = mix.replace(/--__bf-base/g, scratchVar);
    el.style.setProperty(ladderVarName(target, stop), expr);
  }
}
