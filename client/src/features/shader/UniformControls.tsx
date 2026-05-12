import { AssetPicker } from "../../components/AssetPicker";
import { SliderField } from "../../components/SliderField";
import { fieldLabel, textInput } from "../../styles/classes";
import type { UniformDecl, UniformValue } from "./translator";

// Auto-generated form for the user uniforms parsed from a shader.
// Each declaration produces one of:
//   bool                                   → checkbox
//   int  | hint_range(min, max[, step])    → integer SliderField
//   int  | no hint                         → number input
//   float | hint_range(min, max[, step])   → float SliderField
//   float | no hint                        → number input
//   vec3/vec4 | source_color / hint_color  → native color picker (vec4
//                                            also exposes an alpha
//                                            slider; alpha defaults to 1)
//   vec2/vec3/vec4 | no hint               → grouped number inputs
//   sampler2D                              → AssetPicker (per-uniform
//                                            image binding; runtime
//                                            allocates a texture unit)
//
// Numeric values flow through the `values` dict + `onChange` callback.
// Sampler bindings are kept on a separate channel (`samplerValues` +
// `onSamplerChange`) so the existing UniformValue union doesn't have
// to grow a `string` case — paths aren't really uniform "values" in
// the GLSL sense and the runtime needs them on a different path
// (image loading, texture-unit allocation) anyway.

interface Props {
  uniforms: UniformDecl[];
  values: Record<string, UniformValue>;
  onChange: (name: string, value: UniformValue) => void;
  samplerValues: Record<string, string>;
  onSamplerChange: (name: string, path: string) => void;
  /** Optional "reset all to defaults" affordance for the numeric
   *  uniforms. Samplers are deliberately left untouched — the user's
   *  carefully-picked image bindings shouldn't get wiped when they
   *  scrub a slider too far and want it back to default. */
  onReset?: () => void;
}

export function UniformControls({
  uniforms,
  values,
  onChange,
  samplerValues,
  onSamplerChange,
  onReset,
}: Props) {
  if (uniforms.length === 0) {
    return (
      <p className="font-mono text-[10px] text-neutral-500">
        No uniforms declared.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {uniforms.map((u) => (
        <UniformRow
          key={u.name}
          uniform={u}
          value={values[u.name]}
          onChange={(v) => onChange(u.name, v)}
          samplerValue={samplerValues[u.name] ?? ""}
          onSamplerChange={(path) => onSamplerChange(u.name, path)}
        />
      ))}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 hover:text-emerald-400"
        >
          Reset uniforms
        </button>
      )}
    </div>
  );
}

interface RowProps {
  uniform: UniformDecl;
  value: UniformValue | undefined;
  onChange: (v: UniformValue) => void;
  samplerValue: string;
  onSamplerChange: (path: string) => void;
}

function UniformRow({
  uniform,
  value,
  onChange,
  samplerValue,
  onSamplerChange,
}: RowProps) {
  const { type, name, hint } = uniform;

  if (type === "sampler2D") {
    const isScreenTexture = uniform.samplerHints.some(
      (h) => h.name === "hint_screen_texture",
    );
    if (isScreenTexture) {
      // hint_screen_texture samplers don't get their own AssetPicker —
      // the runtime aliases them to the same image the "Test image"
      // picker above drives (texture unit 0). Render a read-only note
      // explaining the wiring so the user doesn't go hunting for a
      // missing picker.
      return (
        <div className="space-y-1">
          <span className={fieldLabel}>{name}</span>
          <div className="border border-neutral-800 bg-neutral-900 px-2 py-1.5 font-mono text-[10px] text-neutral-500">
            screen texture · driven by the &quot;Test image&quot; picker above
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <span className={fieldLabel}>{name}</span>
        <AssetPicker
          path={samplerValue}
          onChange={onSamplerChange}
          placeholder="(no image)"
        />
      </div>
    );
  }

  if (type === "bool") {
    const v = typeof value === "boolean" ? value : false;
    return (
      <label className="flex items-center gap-2 font-mono text-xs text-neutral-200">
        <input
          type="checkbox"
          checked={v}
          onChange={(e) => onChange(e.target.checked)}
          className="size-3 accent-emerald-600"
        />
        {name}
      </label>
    );
  }

  if ((type === "int" || type === "float") && hint?.name === "hint_range") {
    const range = parseHintRange(hint.args, type);
    if (range) {
      const v = typeof value === "number" ? value : range.defaultValue;
      return (
        <SliderField
          label={name}
          min={range.min}
          max={range.max}
          step={range.step}
          value={v}
          onChange={onChange}
          format={(x) => formatNumber(x, type)}
        />
      );
    }
  }

  if (type === "int" || type === "float") {
    const v = typeof value === "number" ? value : 0;
    return (
      <div className="space-y-1">
        <span className={fieldLabel}>{name}</span>
        <input
          type="number"
          value={v}
          step={type === "int" ? 1 : "any"}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${textInput} mt-0`}
        />
      </div>
    );
  }

  if (type === "vec3" && (hint?.name === "source_color" || hint?.name === "hint_color")) {
    const v = Array.isArray(value) && value.length === 3 ? value : [1, 1, 1];
    return (
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={fieldLabel}>{name}</span>
          <span className="font-mono text-[10px] text-neutral-500">
            {rgbToHex(v[0]!, v[1]!, v[2]!)}
          </span>
        </div>
        <input
          type="color"
          value={rgbToHex(v[0]!, v[1]!, v[2]!)}
          onChange={(e) => onChange(hexToRgb(e.target.value))}
          className="h-7 w-full cursor-pointer border-2 border-neutral-700 bg-neutral-900 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
          aria-label={name}
        />
      </div>
    );
  }

  if (type === "vec4" && (hint?.name === "source_color" || hint?.name === "hint_color")) {
    const v = Array.isArray(value) && value.length === 4 ? value : [1, 1, 1, 1];
    return (
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={fieldLabel}>{name}</span>
          <span className="font-mono text-[10px] text-neutral-500">
            {rgbToHex(v[0]!, v[1]!, v[2]!)} · α={v[3]!.toFixed(2)}
          </span>
        </div>
        <input
          type="color"
          value={rgbToHex(v[0]!, v[1]!, v[2]!)}
          onChange={(e) => {
            const [r, g, b] = hexToRgb(e.target.value);
            onChange([r, g, b, v[3]!]);
          }}
          className="h-7 w-full cursor-pointer border-2 border-neutral-700 bg-neutral-900 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
          aria-label={`${name} color`}
        />
        <SliderField
          label="α"
          min={0}
          max={1}
          step={0.01}
          value={v[3]!}
          onChange={(a) => onChange([v[0]!, v[1]!, v[2]!, a])}
          format={(x) => x.toFixed(2)}
        />
      </div>
    );
  }

  // Plain vector — number inputs side by side, one per component.
  if (type === "vec2" || type === "vec3" || type === "vec4") {
    const len = type === "vec2" ? 2 : type === "vec3" ? 3 : 4;
    const v = Array.isArray(value) && value.length === len ? value : Array(len).fill(0);
    const labels = ["x", "y", "z", "w"];
    return (
      <div className="space-y-1">
        <span className={fieldLabel}>{name}</span>
        <div className={`grid gap-1 ${len === 2 ? "grid-cols-2" : len === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {Array.from({ length: len }, (_, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="text-[9px] text-neutral-500">{labels[i]}</span>
              <input
                type="number"
                value={v[i]}
                step="any"
                onChange={(e) => {
                  const next = [...v];
                  next[i] = Number(e.target.value);
                  onChange(next);
                }}
                className={`${textInput} mt-0 font-mono text-[10px]`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono text-[10px] text-neutral-500">
      {type} {name} (unsupported control)
    </div>
  );
}

interface HintRange {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

function parseHintRange(args: string[], type: "int" | "float"): HintRange | null {
  if (args.length < 2) return null;
  const min = Number(args[0]);
  const max = Number(args[1]);
  const stepRaw = args[2];
  if (Number.isNaN(min) || Number.isNaN(max)) return null;
  const step = stepRaw !== undefined ? Number(stepRaw) : type === "int" ? 1 : (max - min) / 100;
  return { min, max, step, defaultValue: min };
}

function formatNumber(v: number, type: "int" | "float"): string {
  if (type === "int") return String(Math.round(v));
  // Trim to ~3 sig figs to keep the slider value chip readable while
  // still showing precision near zero.
  if (Math.abs(v) < 0.01) return v.toFixed(4);
  if (Math.abs(v) < 1) return v.toFixed(3);
  if (Math.abs(v) < 100) return v.toFixed(2);
  return v.toFixed(1);
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  const hex = (x: number) => clamp(x).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length !== 6) return [1, 1, 1];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Derive the initial value for a uniform from its parsed default
 * expression. Exported so the parent (Edit page) can hydrate the values
 * dict before the first render. Falls back to a type-appropriate zero
 * when the default is absent or unparseable.
 */
export function uniformDefault(u: UniformDecl): UniformValue {
  if (u.type === "bool") {
    return u.defaultValue?.trim() === "true";
  }
  if (u.type === "int" || u.type === "float") {
    if (u.defaultValue) {
      const n = Number(u.defaultValue.trim().replace(/[fF]$/, ""));
      if (!Number.isNaN(n)) return n;
    }
    // For hint_range without explicit default, seed at min.
    if (u.hint?.name === "hint_range" && u.hint.args.length >= 1) {
      const n = Number(u.hint.args[0]);
      if (!Number.isNaN(n)) return n;
    }
    return 0;
  }
  if (u.type === "vec2" || u.type === "vec3" || u.type === "vec4") {
    const len = u.type === "vec2" ? 2 : u.type === "vec3" ? 3 : 4;
    if (u.defaultValue) {
      const parsed = parseVecLiteral(u.defaultValue, len);
      if (parsed) return parsed;
    }
    // Default to opaque white for color hints, zero otherwise.
    if (u.hint?.name === "source_color" || u.hint?.name === "hint_color") {
      return len === 3 ? [1, 1, 1] : [1, 1, 1, 1];
    }
    return Array(len).fill(0);
  }
  return 0;
}

function parseVecLiteral(raw: string, len: number): number[] | null {
  const m = /^\s*vec[234]\s*\(\s*(.*?)\s*\)\s*$/.exec(raw);
  if (!m) return null;
  const args = m[1]!.split(",").map((s) => Number(s.trim().replace(/[fF]$/, "")));
  if (args.some(Number.isNaN)) return null;
  if (args.length === 1) {
    // vec3(0.5) → [0.5, 0.5, 0.5] etc.
    return Array(len).fill(args[0]!);
  }
  if (args.length === len) return args;
  return null;
}
