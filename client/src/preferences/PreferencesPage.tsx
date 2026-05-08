import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  godotProjectApi,
  type GodotProjectInfo,
  type GodotProjectValidation,
} from "../lib/api";
import { FONT_SIZE, FONTS, LETTER_SPACING, useFont, useFontSize, useLetterSpacing } from "../styles/Font";
import {
  DEFAULT_THEME_NAME,
  setActiveColorTheme,
  setActiveFont,
  setActiveFontSize,
  setActiveLetterSpacing,
  useGlobalThemes,
  useGodotProjectRoot,
} from "../styles/GlobalTheme";
import { showConfirm, showPrompt } from "../components/Modal";
import { THEMES, useTheme } from "../styles/Theme";
import { Button } from "../components/Button";
import { fieldLabel, textInput } from "../styles/classes";

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

function ColorThemeSection() {
  const { theme } = useTheme();
  return (
    <div className="space-y-2">
      <span className={fieldLabel}>Accent + canvas tint</span>
      <div
        className="flex flex-wrap gap-3"
        role="radiogroup"
        aria-label="Color theme"
      >
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setActiveColorTheme(t.id)}
              className={`flex items-center gap-2 border-2 px-2 py-1 text-xs transition-colors ${
                active
                  ? "border-emerald-400 bg-emerald-950/40 text-emerald-100"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:bg-neutral-900"
              }`}
            >
              <span
                className="size-4 border border-black/40"
                style={{ background: t.swatch }}
              />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
