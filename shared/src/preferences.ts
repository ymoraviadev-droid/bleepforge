import { z } from "zod";

// Persistent appearance preferences — one document per project, mirroring the
// concept singleton pattern. Stored at `data/preferences.json` and served via
// /api/preferences (GET + PUT). The names/IDs are kept as plain strings here
// so that the canonical metadata (labels, swatches, font families) can live
// alongside the React UI without forcing a cross-package import — invalid
// values just fall back to defaults at apply-time on the client.

// Per-theme color overrides applied on top of the built-in CSS palette.
// Each value is an arbitrary CSS color (hex picked by `<input type=color>`,
// or any other valid CSS color string). When set, runtime applies them via
// setProperty on `<html>`, which beats the [data-theme="..."] CSS block by
// inline-specificity. Missing fields leave the built-in defaults alone.
//
// The 11 stops of `accent` + `neutral` derive at render-time via CSS
// `color-mix(in oklch, ...)` from the picked base — no JS color math
// needed. Built-in themes are still CSS-only and not editable; users fork
// (= set overrides on) a GlobalTheme record to customize.
export const ColorOverridesSchema = z.object({
  /** Drives the full --color-emerald-* ladder. Picked = the 500 stop. */
  accent: z.string().optional(),
  /** Drives the full --color-neutral-* ladder. Picked = the 500 stop. */
  neutral: z.string().optional(),
  /** Single color for --canvas-bg (dialog-graph backdrop, etc.). */
  canvasBg: z.string().optional(),
  /** Single color for --canvas-pattern (dot grid on the canvas). */
  canvasPattern: z.string().optional(),
});

export type ColorOverrides = z.infer<typeof ColorOverridesSchema>;

// A user-authored color theme. `base` is one of the 8 built-in
// ThemeIds (dark/light/red/...); its CSS block applies first as the
// foundation, then `overrides` set inline-style properties on top of
// it. So "midnight emerald" can be `base: "dark"` + `overrides:
// { accent: "#10b981" }` — start from dark, override just the accent.
// Reusable: multiple GlobalTheme records can reference the same custom
// theme by name, picking it up with different font/size combos.
export const CustomColorThemeSchema = z.object({
  name: z.string().min(1),
  base: z.string().default("dark"),
  overrides: ColorOverridesSchema.default({}),
});

export type CustomColorTheme = z.infer<typeof CustomColorThemeSchema>;

export const GlobalThemeSchema = z.object({
  name: z.string().min(1),
  // ThemeId of a built-in OR the `name` of a CustomColorTheme.
  // Resolution at apply-time: look up in customColorThemes first
  // (when matched, apply base CSS + overrides); fall back to built-in.
  colorTheme: z.string().default("dark"),
  // FontId — one of "pixelify"/"silkscreen"/"jersey10"/"tiny5"/"dotgothic16"/
  // "handjet"/"workbench"/"sixtyfour".
  font: z.string().default("pixelify"),
  fontSize: z.number().default(1),
  letterSpacing: z.number().default(0.01),
});

export const PreferencesSchema = z.object({
  themes: z.array(GlobalThemeSchema).default([]),
  activeName: z.string().default(""),
  /** User-created color themes — built-ins (the 8 fixed CSS blocks)
   *  stay out of this list and are always available. */
  customColorThemes: z.array(CustomColorThemeSchema).default([]),
  // Absolute path to the Godot project. When set, takes priority over the
  // GODOT_PROJECT_ROOT env var at server boot. Empty string / undefined
  // means "fall back to env." The setting is read once at boot — changes
  // require a server restart, by design (no hot-swap in v1).
  godotProjectRoot: z.string().default(""),
});

export type GlobalTheme = z.infer<typeof GlobalThemeSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;

export const emptyPreferences = (): Preferences => ({
  themes: [],
  activeName: "",
  customColorThemes: [],
  godotProjectRoot: "",
});
