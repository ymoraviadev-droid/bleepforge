import { type ReactNode } from "react";
import {
  FONT_SIZE,
  FONTS,
  LETTER_SPACING,
  useFont,
  useFontSize,
  useLetterSpacing,
  type FontId,
} from "../Font";
import { THEMES, useTheme } from "../Theme";
import { fieldLabel, textInput } from "../ui";
import { ImportSection } from "./ImportSection";

export function PreferencesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Preferences</h1>
        <p className="mt-1 text-xs text-neutral-400">
          Editor settings + the import-from-Godot tool. Everything here is
          local to this browser (theme + typography live in localStorage;
          import writes JSON files in <span className="font-mono">data/</span>).
        </p>
      </div>

      <Section title="Theme">
        <ThemeSection />
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

function ThemeSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-2">
      <span className={fieldLabel}>Accent + canvas tint</span>
      <div
        className="flex flex-wrap gap-3"
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
              onClick={() => setTheme(t.id)}
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
  const { font, setFont } = useFont();
  const { fontSize, setFontSize } = useFontSize();
  const { letterSpacing, setLetterSpacing } = useLetterSpacing();
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
          onChange={(e) => setFont(e.target.value as FontId)}
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
        onChange={setFontSize}
        onReset={() => setFontSize(FONT_SIZE.default)}
        hint="Scales the entire UI proportionally (text + padding)."
      />

      <RangeField
        label="Letter spacing"
        suffix={`${letterSpacing.toFixed(2)} em`}
        min={LETTER_SPACING.min}
        max={LETTER_SPACING.max}
        step={LETTER_SPACING.step}
        value={letterSpacing}
        onChange={setLetterSpacing}
        onReset={() => setLetterSpacing(LETTER_SPACING.default)}
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
