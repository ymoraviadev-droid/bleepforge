import { useEffect, useState } from "react";

const STORAGE_KEY = "bleepforge:theme";

export const THEMES = [
  { id: "dark", label: "Dark", swatch: "oklch(0.18 0 0)" },
  { id: "light", label: "Light", swatch: "oklch(0.72 0 0)" },
  { id: "red", label: "Red", swatch: "oklch(0.577 0.245 27.325)" },
  { id: "amber", label: "Amber", swatch: "oklch(0.769 0.188 70.08)" },
  { id: "green", label: "Green", swatch: "oklch(0.508 0.118 165.612)" },
  { id: "cyan", label: "Cyan", swatch: "oklch(0.715 0.143 215.221)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.546 0.245 262.881)" },
  { id: "magenta", label: "Magenta", swatch: "oklch(0.591 0.293 322.896)" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
const VALID_IDS = new Set<string>(THEMES.map((t) => t.id));

function readSaved(): ThemeId {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_IDS.has(saved)) return saved as ThemeId;
  } catch {}
  return "dark";
}

let currentTheme: ThemeId = readSaved();
const subscribers = new Set<() => void>();

function applyToDOM(id: ThemeId) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = id;
  }
}

// Apply early at module load (before React mounts) so there's no flash.
applyToDOM(currentTheme);

// 220ms theme cross-fade. While the `theme-transitioning` class is on
// <html>, color-bearing properties (background, color, border) carry
// a brief 200ms transition — see `.theme-transitioning *` in index.css.
// The class is removed after the transition completes so normal hover/
// state changes elsewhere stay snappy. Tracked via a single timer that
// resets if setTheme is called again mid-transition (rapid switches
// keep fading instead of snapping).
const THEME_TRANSITION_MS = 220;
let themeTransitionTimer: number | undefined;
function markThemeTransition() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-transitioning");
  if (themeTransitionTimer !== undefined) {
    window.clearTimeout(themeTransitionTimer);
  }
  themeTransitionTimer = window.setTimeout(() => {
    root.classList.remove("theme-transitioning");
    themeTransitionTimer = undefined;
  }, THEME_TRANSITION_MS);
}

export function setTheme(id: ThemeId) {
  if (id === currentTheme) return;
  markThemeTransition();
  currentTheme = id;
  applyToDOM(id);
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {}
  for (const fn of subscribers) fn();
}

export function getTheme(): ThemeId {
  return currentTheme;
}

export function useTheme(): { theme: ThemeId; setTheme: (id: ThemeId) => void } {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    subscribers.add(sub);
    return () => {
      subscribers.delete(sub);
    };
  }, []);
  return { theme: currentTheme, setTheme };
}
