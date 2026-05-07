import { useEffect, useState } from "react";
import {
  PreferencesSchema,
  type GlobalTheme,
  type Preferences,
} from "@bleepforge/shared";
import { preferencesApi } from "./api";
import {
  FONT_SIZE,
  LETTER_SPACING,
  getFont,
  getFontSize,
  getLetterSpacing,
  setFont,
  setFontSize,
  setLetterSpacing,
  type FontId,
} from "./Font";
import { getTheme, setTheme, type ThemeId } from "./Theme";

// A "Global theme" is a named bundle of every persistent appearance setting
// — color theme + body font + UI scale + letter spacing. Stored canonically
// at `data/preferences.json` (single PUT/GET endpoint, mirrors concept.json),
// with a localStorage cache for instant boot paint so there's no "default
// theme flash" while the fetch resolves.
//
// Tauri-readiness note: the server-backed file works identically in Tauri
// because the React app fetches the local Express server in both web and
// desktop builds; if/when we ever need fully-offline boot, the localStorage
// cache below is already enough to render the app correctly without the
// server.

const DEFAULT_NAME = "default";
const CACHE_KEY = "bleepforge:globalThemesCache";

export type { GlobalTheme };

function snapshotCurrent(name: string): GlobalTheme {
  return {
    name,
    colorTheme: getTheme(),
    font: getFont(),
    fontSize: getFontSize(),
    letterSpacing: getLetterSpacing(),
  };
}

// ---- Cache (boot-only) ------------------------------------------------------
// Read at module load so the initial theme apply doesn't need to wait for the
// server. Written on every successful server save.

function readCache(): Preferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return PreferencesSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCache(p: Preferences) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {}
}

// ---- State + pub/sub --------------------------------------------------------

let themes: GlobalTheme[] = [];
let activeName: string = DEFAULT_NAME;
const subs = new Set<() => void>();

function notify() {
  for (const fn of subs) fn();
}

function find(name: string): GlobalTheme | undefined {
  return themes.find((t) => t.name === name);
}

function applyToDom(t: GlobalTheme) {
  setTheme(t.colorTheme as ThemeId);
  setFont(t.font as FontId);
  setFontSize(t.fontSize);
  setLetterSpacing(t.letterSpacing);
}

function snapshotPreferences(): Preferences {
  return { themes: themes.slice(), activeName };
}

// Fire-and-mostly-forget save. Updates the cache on success; logs and continues
// on failure (the in-memory state stays valid; a later save will retry the
// underlying values).
let saveQueue: Promise<void> = Promise.resolve();
function persist() {
  const next = snapshotPreferences();
  writeCache(next); // synchronous so the cache always matches state
  saveQueue = saveQueue.then(async () => {
    try {
      await preferencesApi.save(next);
    } catch (err) {
      console.warn("[global-theme] server save failed:", err);
    }
  });
}

function adopt(prefs: Preferences, applyDom: boolean) {
  themes = prefs.themes;
  // Resolve active: prefer the saved name, fall back to default, then first.
  const desired = prefs.activeName || DEFAULT_NAME;
  const found = themes.find((t) => t.name === desired) ?? themes[0];
  if (found) {
    activeName = found.name;
    if (applyDom) applyToDom(found);
  } else {
    activeName = DEFAULT_NAME;
  }
  notify();
}

// ---- Init -------------------------------------------------------------------
// Two-phase: synchronous cache apply, then async server reconcile. If neither
// has anything, snapshot the current Theme/Font module values into a "default"
// theme on first run.

let initialized = false;
function initSync() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;

  const cached = readCache();
  if (cached && cached.themes.length > 0) {
    adopt(cached, true);
  } else {
    // First run / cleared cache. Use whatever Theme/Font already have
    // applied (their own legacy localStorage already booted them) as the
    // default theme.
    themes = [snapshotCurrent(DEFAULT_NAME)];
    activeName = DEFAULT_NAME;
    notify();
  }
}

async function initAsync() {
  if (typeof window === "undefined") return;
  try {
    const remote = await preferencesApi.get();
    if (!remote.themes || remote.themes.length === 0) {
      // Server has nothing — push our local state up so the file gets created.
      persist();
      return;
    }
    // Reconcile only if the remote state differs from local. Cheap structural
    // compare via JSON.
    const localStr = JSON.stringify(snapshotPreferences());
    const remoteStr = JSON.stringify({
      themes: remote.themes,
      activeName: remote.activeName,
    });
    if (localStr === remoteStr) return;
    adopt(remote, true);
    writeCache(remote);
  } catch (err) {
    console.warn("[global-theme] server fetch failed, staying on cache:", err);
  }
}

initSync();
// Schedule the async reconcile after the splash starts so it doesn't compete
// with the initial paint.
if (typeof window !== "undefined") {
  setTimeout(() => void initAsync(), 0);
}

// ---- Public read API --------------------------------------------------------

export function listGlobalThemes(): GlobalTheme[] {
  return themes.slice();
}

export function getActiveGlobalThemeName(): string {
  return activeName;
}

export function getActiveGlobalTheme(): GlobalTheme | undefined {
  return find(activeName);
}

// ---- Public mutators --------------------------------------------------------

export function switchGlobalTheme(name: string) {
  const t = find(name);
  if (!t) return;
  activeName = name;
  applyToDom(t);
  persist();
  notify();
}

export function createGlobalTheme(name: string): GlobalTheme | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (find(trimmed)) return null;
  const next = snapshotCurrent(trimmed);
  themes = [...themes, next];
  activeName = trimmed;
  persist();
  notify();
  return next;
}

export function deleteGlobalTheme(name: string) {
  if (name === DEFAULT_NAME) return;
  if (!find(name)) return;
  themes = themes.filter((t) => t.name !== name);
  if (activeName === name) {
    const fallback = find(DEFAULT_NAME) ?? themes[0];
    if (fallback) {
      activeName = fallback.name;
      applyToDom(fallback);
    }
  }
  persist();
  notify();
}

function patchActive(updates: Partial<Omit<GlobalTheme, "name">>) {
  themes = themes.map((t) =>
    t.name === activeName ? { ...t, ...updates } : t,
  );
  persist();
}

// ---- Wrapped setters --------------------------------------------------------
// Use these from the UI instead of the bare Theme/Font setters. Each applies
// DOM via the underlying setter, then persists the new value back into the
// active theme record.

export function setActiveColorTheme(id: ThemeId) {
  setTheme(id);
  patchActive({ colorTheme: id });
  notify();
}

export function setActiveFont(id: FontId) {
  setFont(id);
  patchActive({ font: id });
  notify();
}

export function setActiveFontSize(v: number) {
  setFontSize(v);
  patchActive({ fontSize: clamp(v, FONT_SIZE.min, FONT_SIZE.max) });
  notify();
}

export function setActiveLetterSpacing(v: number) {
  setLetterSpacing(v);
  patchActive({
    letterSpacing: clamp(v, LETTER_SPACING.min, LETTER_SPACING.max),
  });
  notify();
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// ---- React hook -------------------------------------------------------------

export function useGlobalThemes(): {
  themes: GlobalTheme[];
  activeName: string;
  switchTheme: (name: string) => void;
  createNew: (name: string) => GlobalTheme | null;
  deleteByName: (name: string) => void;
  isDefault: boolean;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, []);
  return {
    themes: themes.slice(),
    activeName,
    switchTheme: switchGlobalTheme,
    createNew: createGlobalTheme,
    deleteByName: deleteGlobalTheme,
    isDefault: activeName === DEFAULT_NAME,
  };
}

export const DEFAULT_THEME_NAME = DEFAULT_NAME;
