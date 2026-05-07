import { useEffect, useState } from "react";

const FONT_KEY = "bleepforge:font";
const SIZE_KEY = "bleepforge:fontSize";
const SPACING_KEY = "bleepforge:letterSpacing";

export const FONTS = [
  {
    id: "pixelify",
    label: "Pixelify Sans",
    family: '"Pixelify Sans", system-ui, sans-serif',
  },
  {
    id: "silkscreen",
    label: "Silkscreen",
    family: '"Silkscreen", system-ui, sans-serif',
  },
  {
    id: "jersey10",
    label: "Jersey 10",
    family: '"Jersey 10", system-ui, sans-serif',
  },
  { id: "tiny5", label: "Tiny5", family: '"Tiny5", system-ui, sans-serif' },
  {
    id: "dotgothic16",
    label: "DotGothic16",
    family: '"DotGothic16", system-ui, sans-serif',
  },
  {
    id: "handjet",
    label: "Handjet",
    family: '"Handjet", system-ui, sans-serif',
  },
  {
    id: "workbench",
    label: "Workbench",
    family: '"Workbench", system-ui, sans-serif',
  },
  {
    id: "sixtyfour",
    label: "Sixtyfour",
    family: '"Sixtyfour", system-ui, sans-serif',
  },
] as const;

export type FontId = (typeof FONTS)[number]["id"];
const VALID_IDS = new Set<string>(FONTS.map((f) => f.id));

export const FONT_SIZE = {
  min: 0.75,
  max: 1.5,
  step: 0.05,
  default: 1,
} as const;

export const LETTER_SPACING = {
  min: -0.05,
  max: 0.15,
  step: 0.01,
  default: 0.01,
} as const;

// ---- helpers ----------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, min, max);
  } catch {
    return fallback;
  }
}

function readFontId(): FontId {
  if (typeof window === "undefined") return "pixelify";
  try {
    const saved = window.localStorage.getItem(FONT_KEY);
    if (saved && VALID_IDS.has(saved)) return saved as FontId;
  } catch {}
  return "pixelify";
}

// ---- font id ----------------------------------------------------------------

let currentFont: FontId = readFontId();
const fontSubs = new Set<() => void>();

function applyFont(id: FontId) {
  if (typeof document === "undefined") return;
  if (id === "pixelify") delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = id;
}

export function setFont(id: FontId) {
  if (id === currentFont) return;
  currentFont = id;
  applyFont(id);
  try {
    window.localStorage.setItem(FONT_KEY, id);
  } catch {}
  for (const fn of fontSubs) fn();
}

export function getFont(): FontId {
  return currentFont;
}

export function useFont(): { font: FontId; setFont: (id: FontId) => void } {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    fontSubs.add(sub);
    return () => {
      fontSubs.delete(sub);
    };
  }, []);
  return { font: currentFont, setFont };
}

// ---- font size scale --------------------------------------------------------

let currentSize: number = readNumber(
  SIZE_KEY,
  FONT_SIZE.default,
  FONT_SIZE.min,
  FONT_SIZE.max,
);
const sizeSubs = new Set<() => void>();

function applySize(v: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--text-scale", String(v));
}

export function setFontSize(v: number) {
  const next = clamp(v, FONT_SIZE.min, FONT_SIZE.max);
  if (next === currentSize) return;
  currentSize = next;
  applySize(next);
  try {
    window.localStorage.setItem(SIZE_KEY, String(next));
  } catch {}
  for (const fn of sizeSubs) fn();
}

export function getFontSize(): number {
  return currentSize;
}

export function useFontSize(): {
  fontSize: number;
  setFontSize: (v: number) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    sizeSubs.add(sub);
    return () => {
      sizeSubs.delete(sub);
    };
  }, []);
  return { fontSize: currentSize, setFontSize };
}

// ---- letter spacing ---------------------------------------------------------

let currentSpacing: number = readNumber(
  SPACING_KEY,
  LETTER_SPACING.default,
  LETTER_SPACING.min,
  LETTER_SPACING.max,
);
const spacingSubs = new Set<() => void>();

function applySpacing(v: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--body-letter-spacing",
    `${v}em`,
  );
}

export function setLetterSpacing(v: number) {
  const next = clamp(v, LETTER_SPACING.min, LETTER_SPACING.max);
  if (next === currentSpacing) return;
  currentSpacing = next;
  applySpacing(next);
  try {
    window.localStorage.setItem(SPACING_KEY, String(next));
  } catch {}
  for (const fn of spacingSubs) fn();
}

export function getLetterSpacing(): number {
  return currentSpacing;
}

export function useLetterSpacing(): {
  letterSpacing: number;
  setLetterSpacing: (v: number) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    spacingSubs.add(sub);
    return () => {
      spacingSubs.delete(sub);
    };
  }, []);
  return { letterSpacing: currentSpacing, setLetterSpacing };
}

// Apply persisted values immediately at module load so there's no flash.
applyFont(currentFont);
applySize(currentSize);
applySpacing(currentSpacing);
