import { useMemo } from "react";
import { useTheme } from "./Theme";

/**
 * Read computed CSS variable values reactively whenever the theme changes.
 * Use this for inline styles (SVG strokes, marker colors, custom canvas pixels)
 * that can't go through Tailwind classes — those don't auto-restyle on theme
 * change because the JS strings are evaluated once at render time.
 */
export interface ThemeColors {
  accent50: string;
  accent200: string;
  accent300: string;
  accent400: string;
  accent500: string;
  accent600: string;
  accent700: string;
  accent800: string;
  accent900: string;
  accent950: string;
  neutral50: string;
  neutral100: string;
  neutral200: string;
  neutral300: string;
  neutral400: string;
  neutral500: string;
  neutral600: string;
  neutral700: string;
  neutral800: string;
  neutral900: string;
  neutral950: string;
  danger400: string;
  danger600: string;
  danger700: string;
  danger800: string;
  choice400: string;
  choice500: string;
  choice600: string;
  choice700: string;
  choice900: string;
}

function readVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return useMemo(
    () => ({
      accent50: readVar("--color-emerald-50"),
      accent200: readVar("--color-emerald-200"),
      accent300: readVar("--color-emerald-300"),
      accent400: readVar("--color-emerald-400"),
      accent500: readVar("--color-emerald-500"),
      accent600: readVar("--color-emerald-600"),
      accent700: readVar("--color-emerald-700"),
      accent800: readVar("--color-emerald-800"),
      accent900: readVar("--color-emerald-900"),
      accent950: readVar("--color-emerald-950"),
      neutral50: readVar("--color-neutral-50"),
      neutral100: readVar("--color-neutral-100"),
      neutral200: readVar("--color-neutral-200"),
      neutral300: readVar("--color-neutral-300"),
      neutral400: readVar("--color-neutral-400"),
      neutral500: readVar("--color-neutral-500"),
      neutral600: readVar("--color-neutral-600"),
      neutral700: readVar("--color-neutral-700"),
      neutral800: readVar("--color-neutral-800"),
      neutral900: readVar("--color-neutral-900"),
      neutral950: readVar("--color-neutral-950"),
      danger400: readVar("--color-red-400"),
      danger600: readVar("--color-red-600"),
      danger700: readVar("--color-red-700"),
      danger800: readVar("--color-red-800"),
      choice400: readVar("--color-choice-400"),
      choice500: readVar("--color-choice-500"),
      choice600: readVar("--color-choice-600"),
      choice700: readVar("--color-choice-700"),
      choice900: readVar("--color-choice-900"),
    }),
    // Re-read on every theme change. The `theme` value is included so React
    // re-runs the memo even though the JS calls don't reference it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
}
