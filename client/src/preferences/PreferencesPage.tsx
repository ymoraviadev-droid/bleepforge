import { type ReactNode } from "react";
import { FONT_SIZE, FONTS, LETTER_SPACING, useFont, useFontSize, useLetterSpacing } from "../Font";
import {
  DEFAULT_THEME_NAME,
  setActiveColorTheme,
  setActiveFont,
  setActiveFontSize,
  setActiveLetterSpacing,
  useGlobalThemes,
} from "../GlobalTheme";
import { showConfirm, showPrompt } from "../Modal";
import { THEMES, useTheme } from "../Theme";
import { Button } from "../Button";
import { fieldLabel, textInput } from "../ui";
import { ImportSection } from "./ImportSection";

export function PreferencesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Preferences</h1>
        <p className="mt-1 text-xs text-neutral-400">
          Editor settings + the import-from-Godot tool. Color theme +
          typography are bundled into a global theme; the active one is
          saved to <span className="font-mono">data/preferences.json</span>{" "}
          and reapplied each session. Import writes JSON files in{" "}
          <span className="font-mono">data/</span>.
        </p>
      </div>

      <Section title="Global theme">
        <GlobalThemeSection />
      </Section>

      <Section title="Color theme">
        <ColorThemeSection />
      </Section>

      <Section title="Typography">
        <TypographySection />
      </Section>

      <Section title="Import from Godot">
        <ImportSection />
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
