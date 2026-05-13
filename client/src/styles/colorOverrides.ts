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
// scratch var per palette so the two ladders don't collide.
const SCRATCH = {
  accent: "--__bf-base-accent",
  neutral: "--__bf-base-neutral",
} as const;

/** Apply `overrides` to the document root via inline setProperty. Missing
 *  fields are cleared so toggling overrides off restores the built-in's
 *  CSS-block defaults. Safe to call repeatedly. */
export function applyColorOverrides(
  overrides: ColorOverrides | undefined,
): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;

  applyLadder(el, "accent", "emerald", overrides?.accent);
  applyLadder(el, "neutral", "neutral", overrides?.neutral);

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

function applyLadder(
  el: HTMLElement,
  scratchKey: keyof typeof SCRATCH,
  tailwindFamily: "emerald" | "neutral",
  base: string | undefined,
): void {
  const scratchVar = SCRATCH[scratchKey];
  if (!base) {
    // Clear the scratch + every stop. Removing scratch breaks the
    // `var(--__bf-base)` references in any leftover mix expressions
    // and the CSS-block defaults take over.
    el.style.removeProperty(scratchVar);
    for (const { stop } of LADDER) {
      el.style.removeProperty(`--color-${tailwindFamily}-${stop}`);
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
    el.style.setProperty(`--color-${tailwindFamily}-${stop}`, expr);
  }
}
