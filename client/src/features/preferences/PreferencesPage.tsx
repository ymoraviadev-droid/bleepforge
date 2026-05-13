import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomColorTheme } from "@bleepforge/shared";
import {
  godotProjectApi,
  type GodotProjectInfo,
  type GodotProjectValidation,
} from "../../lib/api";
import { FONT_SIZE, FONTS, LETTER_SPACING, useFont, useFontSize, useLetterSpacing } from "../../styles/Font";
import {
  DEFAULT_THEME_NAME,
  clearCustomColorOverrides,
  createCustomColorTheme,
  deleteCustomColorTheme,
  setActiveColorTheme,
  setActiveFont,
  setActiveFontSize,
  setActiveLetterSpacing,
  setCustomColorOverride,
  useCustomColorThemes,
  useGlobalThemes,
  useGodotProjectRoot,
} from "../../styles/GlobalTheme";
import { showChoice, showConfirm, showPrompt } from "../../components/Modal";
import { readVarAsHex } from "../../styles/colorOverrides";
import { THEMES } from "../../styles/Theme";
import { Button } from "../../components/Button";
import { PixelSlider } from "../../components/PixelSlider";
import { fieldLabel, textInput } from "../../styles/classes";

export function PreferencesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Preferences</h1>
        <p className="mt-1 text-xs text-neutral-400">
          Editor settings. Color theme + typography are bundled into a
          global theme; the active one is saved to{" "}
          <span className="font-mono">data/preferences.json</span> and
          reapplied each session.
        </p>
      </div>

      <Section title="Godot project">
        <GodotProjectSection />
      </Section>

      <Section title="Global theme">
        <GlobalThemeSection />
      </Section>

      <Section title="Color theme">
        <ColorThemeSection />
      </Section>

      <Section title="Typography">
        <TypographySection />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-2 border-neutral-800 p-4">
      <h2 className="font-display text-xs tracking-wider text-emerald-400">
        {title.toUpperCase()}
      </h2>
      {children}
    </section>
  );
}

function GodotProjectSection() {
  const { saved, set } = useGodotProjectRoot();
  // The "running config" — what the server resolved at boot. May differ from
  // `saved` when a path change has been written to preferences.json but the
  // server hasn't been restarted yet.
  const [info, setInfo] = useState<GodotProjectInfo | null>(null);
  const [draft, setDraft] = useState(saved);
  const [validation, setValidation] = useState<GodotProjectValidation | null>(null);

  // Re-sync draft when saved changes (e.g. after a successful save round-trip
  // or another tab updated the preferences file).
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  // Fetch the running effective root once on mount.
  useEffect(() => {
    let cancelled = false;
    godotProjectApi
      .get()
      .then((r) => {
        if (!cancelled) setInfo(r);
      })
      .catch(() => {
        // Endpoint failure here is non-fatal — UI just won't show the
        // "currently active" hint, but save still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced live validation while the user types. Empty draft is a valid
  // state (means "fall back to env") so we skip validation when blank.
  useEffect(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setValidation(null);
      return;
    }
    setValidation(null); // Clear stale verdict while we wait for the new one.
    const handle = setTimeout(() => {
      godotProjectApi.validate(trimmed).then(setValidation).catch(() => {
        setValidation({ ok: false, exists: false, isProject: false, message: "Validation failed" });
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [draft]);

  const trimmedDraft = draft.trim();
  const dirty = trimmedDraft !== saved.trim();
  // Empty is always saveable (clears the override → falls back to env on next
  // boot). Non-empty must validate.
  const canSave = dirty && (trimmedDraft === "" || validation?.ok === true);
  // Restart-required when the saved value is non-empty and differs from what
  // the server resolved at boot. We compare absolute paths to avoid trailing-
  // slash false positives.
  const restartRequired = useMemo(() => {
    if (!info) return false;
    const savedNorm = saved.trim().replace(/\/+$/, "");
    const effectiveNorm = (info.effective ?? "").replace(/\/+$/, "");
    return savedNorm !== "" && savedNorm !== effectiveNorm;
  }, [info, saved]);

  const onSave = () => {
    set(trimmedDraft);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400">
        Absolute path to your Flock of Bleeps Godot project. Bleepforge
        reads <span className="font-mono">.tres</span> files from here on
        boot and writes saves back to them. Changes take effect on next
        server restart — the path is captured once at startup, not per
        request.
      </p>

      <label className="block">
        <span className={fieldLabel}>Project root</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="/home/you/Godot/astro-man"
          spellCheck={false}
          className={`${textInput} font-mono text-sm`}
        />
      </label>

      {trimmedDraft && validation && (
        <div className="text-xs">
          {validation.ok ? (
            <span className="text-emerald-400">
              ✓ Valid Godot project (project.godot found)
            </span>
          ) : (
            <span className="text-red-400">✗ {validation.message}</span>
          )}
        </div>
      )}

      {info && (
        <div className="text-xs text-neutral-500">
          Currently active:{" "}
          <span className="font-mono text-neutral-300">
            {info.effective ?? "(none)"}
          </span>{" "}
          {info.source && (
            <span className="text-neutral-500">
              — from {info.source === "preferences" ? "this preferences file" : ".env"}
            </span>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="secondary" size="sm" onClick={() => setDraft(saved)}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          {trimmedDraft === "" && dirty ? "Clear (use .env)" : "Save"}
        </Button>
      </div>

      {restartRequired && (
        <div className="border-2 border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
          ⟳ Saved. Restart the server to apply — the running process is still
          using the previous root.
        </div>
      )}
    </div>
  );
}

function GlobalThemeSection() {
  const { themes, activeName, switchTheme, createNew, deleteByName, isDefault } =
    useGlobalThemes();

  const onNew = async () => {
    const name = await showPrompt({
      title: "New global theme",
      message:
        "Saves the current color theme + typography under a new name. The new theme becomes active immediately.",
      placeholder: "e.g. Dark Amber, Reading Mode, Big Type",
      validate: (v) => {
        const trimmed = v.trim();
        if (!trimmed) return "Name is required";
        if (themes.some((t) => t.name === trimmed)) return "Name already exists";
        if (trimmed.length > 40) return "Keep it under 40 chars";
        return null;
      },
    });
    if (!name) return;
    createNew(name.trim());
  };

  const onDelete = async () => {
    if (isDefault) return;
    const ok = await showConfirm({
      title: `Delete theme "${activeName}"?`,
      message:
        "Switches back to default. The default theme can't be deleted; it's always available as a fallback.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    deleteByName(activeName);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2">
          <span className={`${fieldLabel} shrink-0`}>Active</span>
          <select
            value={activeName}
            onChange={(e) => switchTheme(e.target.value)}
            className={`${textInput} mt-0`}
          >
            {themes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name === DEFAULT_THEME_NAME ? `${t.name} (built-in)` : t.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" size="sm" onClick={onNew}>
          + New
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onDelete}
          disabled={isDefault}
          title={
            isDefault
              ? "The default theme can't be deleted"
              : `Delete "${activeName}"`
          }
        >
          Delete
        </Button>
      </div>
      <p className="text-xs text-neutral-500">
        Color theme and typography changes below save automatically to the
        active theme. Use <span className="text-neutral-300">+ New</span> to
        fork the current settings under a different name before tweaking.
      </p>
    </div>
  );
}

const BUILTIN_IDS = new Set([
  "dark", "light", "red", "amber", "green", "cyan", "blue", "magenta",
]);

function ColorThemeSection() {
  const { custom, activeRef, activeCustom } = useCustomColorThemes();
  // Editor visibility is local UI state, not theme state — toggled by
  // the Edit button. Auto-opens when a fresh fork lands (so the user
  // sees the pickers immediately after Edit/New). Auto-closes when
  // the active theme switches back to a built-in via the select.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!activeCustom && editing) setEditing(false);
  }, [activeCustom, editing]);

  const promptName = async (
    defaultName: string,
    title: string,
    message: string,
  ): Promise<string | null> => {
    return showPrompt({
      title,
      message,
      placeholder: defaultName,
      defaultValue: defaultName,
      confirmLabel: "Create",
      cancelLabel: "Cancel",
      validate: (v) => {
        const t = v.trim();
        if (!t) return "Name is required";
        if (BUILTIN_IDS.has(t)) return "That name is reserved by a built-in";
        if (custom.some((c) => c.name === t)) return "Name already in use";
        return null;
      },
    });
  };

  const handleNew = async () => {
    // Two starting points: inherit from current (built-in or custom),
    // or start blank on dark with no overrides. The chooser keeps both
    // as clear positive actions so neither has to wear the Cancel label.
    const mode = await showChoice({
      title: "New color theme",
      message: activeCustom
        ? `Start the new theme from the currently-selected "${activeCustom.name}" custom theme (carries over its base + overrides), or fresh on the dark built-in with no overrides?`
        : `Start the new theme from the currently-selected "${activeRef}" built-in (inherits its colors as a starting point), or fresh on the dark built-in with no overrides?`,
      options: [
        { id: "blank", label: "Blank (dark)", variant: "secondary" },
        { id: "fork", label: "From current", variant: "primary" },
      ],
    });
    if (!mode) return;
    const defaultName =
      mode === "blank"
        ? "My theme"
        : activeCustom
          ? `${activeCustom.name} copy`
          : `My ${activeRef}`;
    const name = await promptName(
      defaultName,
      "Name the new theme",
      mode === "blank"
        ? "Fresh theme on the dark built-in with no overrides — tweak the colors after."
        : "New theme will inherit the current colors as a starting point.",
    );
    if (!name) return;
    createCustomColorTheme(name.trim(), mode === "blank" ? "blank" : "fork");
    setEditing(true);
  };

  const handleEdit = async () => {
    // Editing a built-in needs to auto-fork: built-in CSS blocks are
    // read-only, so the cleanest UX is "click Edit → fork → land in the
    // editor with the fork active." No separate confirm step; the
    // single name prompt is the user's chance to back out.
    if (!activeCustom) {
      const name = await promptName(
        `My ${activeRef}`,
        `Fork "${activeRef}" to edit?`,
        `Built-ins are read-only — click Create to fork a custom theme starting from "${activeRef}". You can rename or delete the new theme later.`,
      );
      if (!name) return;
      createCustomColorTheme(name.trim(), "fork");
      setEditing(true);
      return;
    }
    setEditing((e) => !e);
  };

  const handleDelete = async () => {
    if (!activeCustom) return;
    const ok = await showConfirm({
      title: `Delete "${activeCustom.name}"?`,
      message: `Any Global theme that referenced it will fall back to the "${activeCustom.base}" built-in.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    deleteCustomColorTheme(activeCustom.name);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-48 flex-1">
          <span className={fieldLabel}>Color theme</span>
          <select
            value={activeRef}
            onChange={(e) => setActiveColorTheme(e.target.value)}
            className={textInput}
          >
            <optgroup label="Built-ins">
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            {custom.length > 0 && (
              <optgroup label="Custom">
                {custom.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} (from {c.base})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <Button onClick={handleNew} variant="secondary" size="sm">
          + New
        </Button>
        <Button onClick={handleEdit} variant="secondary" size="sm">
          {activeCustom ? (editing ? "Close editor" : "Edit") : "Edit"}
        </Button>
        {activeCustom && (
          <Button onClick={handleDelete} variant="danger" size="sm">
            Delete
          </Button>
        )}
      </div>

      {activeCustom && editing && <CustomColorEditor custom={activeCustom} />}
      {!activeCustom && (
        <p className="text-xs text-neutral-500">
          Built-in themes are read-only. <span className="text-neutral-300">Edit</span> forks the current built-in into a custom theme you can tweak; <span className="text-neutral-300">+ New</span> creates one from scratch.
        </p>
      )}
    </div>
  );
}

// ---- Custom-theme inline editor ---------------------------------------------
// Seven color rows for the active custom theme's overrides. Each picker
// is populated from the current EFFECTIVE color — read from the active
// CSS variable via getComputedStyle + canvas color-resolve — so a fresh
// fork of "dark" shows dark's actual accent in the picker, not #000.
// Setting a color writes to the override; ↺ clears it back to the base
// built-in's value. Empty/null means "no override — fall through to base."
//
// The five ladder rows pick the 500-stop; the apply pipeline derives 50
// → 950 from there via CSS color-mix at render time. Canvas bg + pattern
// are direct single-color overrides (no ladder).

const LADDER_FIELDS: Array<{
  key: "accent" | "neutral" | "sourceNpc" | "sourceTerminal" | "choice";
  label: string;
  cssVar: string;
  hint: string;
}> = [
  { key: "accent", label: "Accent (500)", cssVar: "--color-emerald-500", hint: "Drives the full emerald-50→950 ladder." },
  { key: "neutral", label: "Neutral (500)", cssVar: "--color-neutral-500", hint: "Drives the full neutral-50→950 ladder." },
  { key: "sourceNpc", label: "Source NPC (500)", cssVar: "--color-source-npc-500", hint: "Dialog graph NPC node tint." },
  { key: "sourceTerminal", label: "Source Terminal (500)", cssVar: "--color-source-terminal-500", hint: "Dialog graph Terminal node tint." },
  { key: "choice", label: "Choice (500)", cssVar: "--color-choice-500", hint: "Dialog graph choice handles + edges + → glyphs." },
];

const SINGLE_FIELDS: Array<{
  key: "canvasBg" | "canvasPattern";
  label: string;
  cssVar: string;
  hint: string;
}> = [
  { key: "canvasBg", label: "Canvas bg", cssVar: "--canvas-bg", hint: "Dialog-graph backdrop color." },
  { key: "canvasPattern", label: "Canvas pattern", cssVar: "--canvas-pattern", hint: "Dot grid drawn over the canvas." },
];

function CustomColorEditor({ custom }: { custom: CustomColorTheme }) {
  const o = custom.overrides;
  const anyOverride = !!(
    o.accent || o.neutral || o.sourceNpc || o.sourceTerminal ||
    o.choice || o.canvasBg || o.canvasPattern
  );

  return (
    <div className="space-y-3 border-l-2 border-neutral-800 pl-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
          Editing {custom.name} — overrides on {custom.base}
        </span>
        {anyOverride && (
          <button
            type="button"
            onClick={() => clearCustomColorOverrides(custom.name)}
            className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
          >
            ↺ Reset all
          </button>
        )}
      </div>
      <div className="space-y-2">
        <div className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
          Palette ladders — picked color = 500-stop
        </div>
        {LADDER_FIELDS.map((f) => (
          <ColorOverrideRow
            key={f.key}
            label={f.label}
            hint={f.hint}
            cssVar={f.cssVar}
            value={o[f.key]}
            onChange={(v) => setCustomColorOverride(custom.name, f.key, v)}
          />
        ))}
      </div>
      <div className="space-y-2">
        <div className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
          Single colors
        </div>
        {SINGLE_FIELDS.map((f) => (
          <ColorOverrideRow
            key={f.key}
            label={f.label}
            hint={f.hint}
            cssVar={f.cssVar}
            value={o[f.key]}
            onChange={(v) => setCustomColorOverride(custom.name, f.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function ColorOverrideRow({
  label,
  hint,
  cssVar,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  cssVar: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const set = !!value;
  // Picker `value` MUST be a 7-char hex. Three sources, in order:
  //   1. The override value, if set (already hex from <input type=color>).
  //   2. The current effective CSS variable value, resolved via the
  //      canvas-based readVarAsHex — covers oklch() / color-mix() / etc.
  //      The browser is the color-parser so the picker shows the user's
  //      actual current color, not a #000000 placeholder.
  //   3. Fall back to #000000 if reading failed (SSR, malformed CSS).
  //
  // Re-resolves on every render so a theme-switch or sibling-override
  // change updates the picker live. The CSS value chain is fast — one
  // getComputedStyle read + one 1×1 canvas pixel — so the per-render
  // cost is negligible.
  const display = value ?? readVarAsHex(cssVar) ?? "#000000";
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 font-mono text-[11px] text-neutral-300">
        {label}
      </span>
      <input
        type="color"
        value={display}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-12 cursor-pointer border-2 border-neutral-700 bg-neutral-900 p-0"
        title={`${label} color`}
      />
      <span
        className={`min-w-0 flex-1 truncate font-mono text-[10px] ${
          set ? "text-emerald-400" : "text-neutral-500"
        }`}
        title={set ? "Override active" : "Inheriting from base built-in"}
      >
        {set ? `${value} • override` : hint}
      </span>
      {set && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
          title="Reset to built-in"
        >
          ↺
        </button>
      )}
    </div>
  );
}

function TypographySection() {
  const { font } = useFont();
  const { fontSize } = useFontSize();
  const { letterSpacing } = useLetterSpacing();
  const activeFamily =
    FONTS.find((f) => f.id === font)?.family ?? "system-ui, sans-serif";
  return (
    <div className="space-y-4">
      <label className="block">
        <span className={fieldLabel}>Body font</span>
        <p className="mt-1 mb-1.5 text-xs text-neutral-500">
          Press Start 2P (display) and VT323 (mono) stay fixed.
        </p>
        <select
          value={font}
          onChange={(e) => setActiveFont(e.target.value as typeof font)}
          style={{ fontFamily: activeFamily }}
          className={`${textInput} appearance-none pr-8`}
        >
          {FONTS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <RangeField
        label="UI scale"
        suffix={`${Math.round(fontSize * 100)}%`}
        min={FONT_SIZE.min}
        max={FONT_SIZE.max}
        step={FONT_SIZE.step}
        value={fontSize}
        onChange={setActiveFontSize}
        onReset={() => setActiveFontSize(FONT_SIZE.default)}
        hint="Scales the entire UI proportionally (text + padding)."
      />

      <RangeField
        label="Letter spacing"
        suffix={`${letterSpacing.toFixed(2)} em`}
        min={LETTER_SPACING.min}
        max={LETTER_SPACING.max}
        step={LETTER_SPACING.step}
        value={letterSpacing}
        onChange={setActiveLetterSpacing}
        onReset={() => setActiveLetterSpacing(LETTER_SPACING.default)}
        hint="Tracking on body text. Mono (VT323) keeps its own spacing."
      />

      <div className="border-2 border-neutral-800 bg-neutral-900/50 p-3">
        <div className={fieldLabel}>Preview</div>
        <p className="mt-1 text-base text-neutral-100">
          The quick brown fox jumps over the lazy dog. 0123456789
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Smaller line — UI labels and captions render at this size.
        </p>
      </div>
    </div>
  );
}

interface RangeFieldProps {
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  hint?: string;
}

function RangeField({
  label,
  suffix,
  min,
  max,
  step,
  value,
  onChange,
  onReset,
  hint,
}: RangeFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className={fieldLabel}>{label}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono tabular-nums text-neutral-300">
            {suffix}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-emerald-400 hover:text-emerald-300"
          >
            reset
          </button>
        </div>
      </div>
      <PixelSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        aria-label={label}
      />
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
