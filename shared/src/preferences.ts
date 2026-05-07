import { z } from "zod";

// Persistent appearance preferences — one document per project, mirroring the
// concept singleton pattern. Stored at `data/preferences.json` and served via
// /api/preferences (GET + PUT). The names/IDs are kept as plain strings here
// so that the canonical metadata (labels, swatches, font families) can live
// alongside the React UI without forcing a cross-package import — invalid
// values just fall back to defaults at apply-time on the client.

export const GlobalThemeSchema = z.object({
  name: z.string().min(1),
  // ThemeId — one of "dark"/"light"/"red"/"amber"/"green"/"cyan"/"blue"/"magenta".
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
});

export type GlobalTheme = z.infer<typeof GlobalThemeSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;

export const emptyPreferences = (): Preferences => ({ themes: [], activeName: "" });
