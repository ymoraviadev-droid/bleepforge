import { useEffect, useState } from "react";

const STORAGE_KEY = "bleepforge:theme";

export const THEMES = [
  { id: "dark", label: "Dark", swatch: "oklch(0.18 0 0)" },
  { id: "light", label: "Light", swatch: "oklch(0.85 0 0)" },
  { id: "red", label: "Red", swatch: "oklch(0.577 0.245 27.325)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.546 0.245 262.881)" },
  { id: "magenta", label: "Magenta", swatch: "oklch(0.591 0.293 322.896)" },
  { id: "green", label: "Green", swatch: "oklch(0.508 0.118 165.612)" },
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

export function setTheme(id: ThemeId) {
  if (id === currentTheme) return;
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

export function ThemeSwitcher() {
  const { theme, setTheme: set } = useTheme();
  return (
    <div
      className="flex items-center gap-1.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => set(t.id)}
            title={t.label}
            className={`size-5 border-2 transition-colors ${
              active
                ? "border-emerald-400"
                : "border-neutral-700 hover:border-neutral-500"
            }`}
            style={{ background: t.swatch }}
          />
        );
      })}
    </div>
  );
}
