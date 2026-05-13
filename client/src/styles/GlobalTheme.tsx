import { useEffect, useState } from "react";
import {
  PreferencesSchema,
  type ColorOverrides,
  type CustomColorTheme,
  type GlobalTheme,
  type Preferences,
} from "@bleepforge/shared";
import { preferencesApi } from "../lib/api";
import { markBootCheckpoint } from "../lib/boot/progress";
import { applyColorOverrides } from "./colorOverrides";
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
// Cross-window sync channel name. Every Bleepforge window (main + any
// chromeless popouts) joins this channel; whoever changes prefs posts
// the full Preferences doc, the others apply it.
const SYNC_CHANNEL_NAME = "bleepforge:preferences";

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
let customColorThemes: CustomColorTheme[] = [];
let activeName: string = DEFAULT_NAME;
// godotProjectRoot lives alongside themes in the same Preferences document
// even though it isn't a theme. Routing it through the same persist machinery
// avoids two writers racing on data/preferences.json — every save sends the
// full document.
let godotProjectRoot: string = "";
const subs = new Set<() => void>();

function notify() {
  for (const fn of subs) fn();
}

function find(name: string): GlobalTheme | undefined {
  return themes.find((t) => t.name === name);
}

/** Resolve a colorTheme reference (string) to either a built-in id
 *  (apply as data-theme, no overrides) or a custom theme record
 *  (apply base as data-theme, then overrides on top). */
function resolveColorTheme(ref: string): {
  baseId: ThemeId;
  overrides: ColorOverrides | undefined;
} {
  const custom = customColorThemes.find((c) => c.name === ref);
  if (custom) {
    return { baseId: (custom.base as ThemeId), overrides: custom.overrides };
  }
  return { baseId: ref as ThemeId, overrides: undefined };
}

function applyToDom(t: GlobalTheme) {
  const { baseId, overrides } = resolveColorTheme(t.colorTheme);
  setTheme(baseId);
  setFont(t.font as FontId);
  setFontSize(t.fontSize);
  setLetterSpacing(t.letterSpacing);
  // Apply color overrides AFTER setTheme so the new built-in's CSS
  // block lands first, then setProperty inlines win over it where
  // overrides are set. Order matters because setTheme just flips the
  // data-theme attribute; the browser may not have applied the new
  // CSS-block values yet when we setProperty, but inline-style is
  // more specific so they still win at paint.
  applyColorOverrides(overrides);
}

function snapshotPreferences(): Preferences {
  return {
    themes: themes.slice(),
    activeName,
    customColorThemes: customColorThemes.slice(),
    godotProjectRoot,
  };
}

// Fire-and-mostly-forget save. Updates the cache on success; logs and continues
// on failure (the in-memory state stays valid; a later save will retry the
// underlying values).
let saveQueue: Promise<void> = Promise.resolve();
function persist() {
  const next = snapshotPreferences();
  writeCache(next); // synchronous so the cache always matches state
  // Push the new prefs to every other Bleepforge window in the same
  // browser/Electron session. Skipped when we got here BY adopting a
  // broadcast (would cause a feedback loop).
  if (!receivingBroadcast) {
    broadcastPreferences(next);
  }
  saveQueue = saveQueue.then(async () => {
    try {
      await preferencesApi.save(next);
    } catch (err) {
      console.warn("[global-theme] server save failed:", err);
    }
  });
}

// ---- Cross-window sync ------------------------------------------------------
// Same-origin BroadcastChannel: any Bleepforge window subscribes; whoever
// mutates prefs posts the full doc; others apply via adopt(). We keep a
// `receivingBroadcast` flag to suppress the rebroadcast that would otherwise
// fire when the receiver's adopt() → applyToDom() → notify() chain settles.
// (Mutators don't go through that chain — only adopt() does — but the wrapped
// setters call persist() directly, so the flag is the cleanest gate.)

let channel: BroadcastChannel | null = null;
let receivingBroadcast = false;

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel === "undefined") return null;
  if (channel) return channel;
  channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  channel.addEventListener("message", (event) => {
    const parsed = PreferencesSchema.safeParse(event.data);
    if (!parsed.success) {
      console.warn(
        "[global-theme] cross-window sync: invalid payload, ignoring",
        parsed.error,
      );
      return;
    }
    receivingBroadcast = true;
    try {
      adopt(parsed.data, true);
      writeCache(parsed.data);
    } finally {
      receivingBroadcast = false;
    }
  });
  return channel;
}

function broadcastPreferences(prefs: Preferences) {
  getSyncChannel()?.postMessage(prefs);
}

// Explicit teardown — wired to `pagehide` from main.tsx. Forced cleanup
// of long-lived BroadcastChannel during renderer teardown can trip a
// CHECK on Chromium 130 / Linux (SIGTRAP coredump on window close).
// Closing explicitly before the renderer is killed avoids it.
export function closeGlobalThemeChannel(): void {
  if (channel) {
    channel.close();
    channel = null;
  }
}

function adopt(prefs: Preferences, applyDom: boolean) {
  themes = prefs.themes;
  customColorThemes = prefs.customColorThemes ?? [];
  godotProjectRoot = prefs.godotProjectRoot ?? "";
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
  } finally {
    // Splash checkpoint #2: preferences fetched + active theme applied
    // (whether from server or kept-from-cache on fetch failure). Either
    // way, the user's saved theme is now in effect, so the splash can
    // dismiss without a theme-flash on first paint.
    markBootCheckpoint("preferences");
  }
}

initSync();
// Subscribe to cross-window sync at module load so we don't miss the first
// broadcast. (Calling it lazily from broadcastPreferences would only set up
// the listener once *we* persist — too late to catch a sibling popout's
// initial change.)
getSyncChannel();
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

/** Switch the active GlobalTheme's color reference. Accepts either a
 *  built-in ThemeId or a CustomColorTheme name — the apply pipeline
 *  resolves both via `resolveColorTheme`. */
export function setActiveColorTheme(ref: string) {
  themes = themes.map((t) =>
    t.name === activeName ? { ...t, colorTheme: ref } : t,
  );
  const active = find(activeName);
  if (active) applyToDom(active);
  persist();
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

// ---- Custom color theme management ----------------------------------------

/** Read the active GlobalTheme's resolved color theme — either a
 *  built-in (custom === null) or a CustomColorTheme record. Used by
 *  the Preferences UI to show "Editing custom theme X" + populate the
 *  color pickers. */
export function getActiveColorThemeResolved(): {
  ref: string;
  custom: CustomColorTheme | null;
} {
  const g = find(activeName);
  const ref = g?.colorTheme ?? "dark";
  const custom = customColorThemes.find((c) => c.name === ref) ?? null;
  return { ref, custom };
}

export function listCustomColorThemes(): CustomColorTheme[] {
  return customColorThemes.slice();
}

/** Fork the currently active GlobalTheme's color theme into a new
 *  CustomColorTheme record. If the current color theme is a built-in,
 *  the new custom theme uses that as its `base` and starts with empty
 *  overrides (visually identical to the built-in until edited). If the
 *  current is already custom, the new one is a copy with a new name.
 *  Returns the created theme or null on conflict. */
export function createCustomColorTheme(name: string): CustomColorTheme | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (customColorThemes.some((c) => c.name === trimmed)) return null;
  // Don't allow collision with a built-in id either.
  // (Resolution would prefer the custom, masking the built-in.)
  const BUILTIN_IDS = new Set(["dark", "light", "red", "amber", "green", "cyan", "blue", "magenta"]);
  if (BUILTIN_IDS.has(trimmed)) return null;

  const active = find(activeName);
  const fromRef = active?.colorTheme ?? "dark";
  const fromCustom = customColorThemes.find((c) => c.name === fromRef);
  const created: CustomColorTheme = fromCustom
    ? { name: trimmed, base: fromCustom.base, overrides: { ...fromCustom.overrides } }
    : { name: trimmed, base: fromRef, overrides: {} };

  customColorThemes = [...customColorThemes, created];
  // Switch the active GlobalTheme to point at the new custom theme so
  // the user lands editing what they just created.
  themes = themes.map((t) =>
    t.name === activeName ? { ...t, colorTheme: trimmed } : t,
  );
  const refreshed = find(activeName);
  if (refreshed) applyToDom(refreshed);
  persist();
  notify();
  return created;
}

/** Delete a custom color theme by name. Any GlobalTheme that referenced
 *  it falls back to that custom theme's `base` built-in. */
export function deleteCustomColorTheme(name: string): void {
  const target = customColorThemes.find((c) => c.name === name);
  if (!target) return;
  customColorThemes = customColorThemes.filter((c) => c.name !== name);
  themes = themes.map((t) =>
    t.colorTheme === name ? { ...t, colorTheme: target.base } : t,
  );
  const active = find(activeName);
  if (active) applyToDom(active);
  persist();
  notify();
}

/** Set one override field on the named custom color theme. Passing
 *  `undefined` clears that field. */
export function setCustomColorOverride(
  name: string,
  key: keyof ColorOverrides,
  value: string | undefined,
): void {
  customColorThemes = customColorThemes.map((c) => {
    if (c.name !== name) return c;
    const next: ColorOverrides = { ...c.overrides, [key]: value };
    for (const k of Object.keys(next) as Array<keyof ColorOverrides>) {
      if (next[k] === undefined || next[k] === "") delete next[k];
    }
    return { ...c, overrides: next };
  });
  // If the active GlobalTheme references this custom theme, re-apply.
  const active = find(activeName);
  if (active && active.colorTheme === name) applyToDom(active);
  persist();
  notify();
}

/** Clear every override on the named custom color theme — back to the
 *  pure `base` built-in. */
export function clearCustomColorOverrides(name: string): void {
  customColorThemes = customColorThemes.map((c) =>
    c.name === name ? { ...c, overrides: {} } : c,
  );
  const active = find(activeName);
  if (active && active.colorTheme === name) applyToDom(active);
  persist();
  notify();
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// ---- Godot project root setter / hook ---------------------------------------
// Lives in the same module so it shares the persist queue + cache. The setter
// is best-effort: it updates in-memory state and triggers a save, but the new
// value doesn't take effect on the running server until next restart (config
// reads preferences.json once at boot, not on each request).

function setGodotProjectRoot(value: string) {
  godotProjectRoot = value.trim();
  persist();
  notify();
}

export function useGodotProjectRoot(): {
  saved: string;
  set: (v: string) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, []);
  return { saved: godotProjectRoot, set: setGodotProjectRoot };
}

// ---- React hook -------------------------------------------------------------

/** Subscribe to the custom-color-themes list + the active GlobalTheme's
 *  resolved color reference. Returns the active custom theme record when
 *  the active GlobalTheme points at a custom; null otherwise (= built-in
 *  is selected, no edit affordances should be shown). */
export function useCustomColorThemes(): {
  custom: CustomColorTheme[];
  activeRef: string;
  activeCustom: CustomColorTheme | null;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, []);
  const { ref, custom } = getActiveColorThemeResolved();
  return {
    custom: customColorThemes.slice(),
    activeRef: ref,
    activeCustom: custom,
  };
}

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
