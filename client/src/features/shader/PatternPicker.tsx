import type { ShaderPattern } from "@bleepforge/shared";

import { PatternBackdrop, SHADER_PATTERN_LIST } from "./patterns";

// Grid of 10 pattern swatches. Click one to select. The active pattern
// gets an emerald ring; everything else is dimmed slightly to push the
// selection forward visually.
//
// Used in two places:
//   - NewShaderModal: pick a starting pattern at creation time (server
//     pre-fills a random one; the user can change it before submitting).
//   - Edit page sidebar: change the pattern at any time, saves
//     immediately via shadersApi.setPattern.

interface Props {
  value: ShaderPattern | null;
  onChange: (next: ShaderPattern) => void;
  /** Per-swatch tint. Defaults to the emerald accent — the picker doesn't
   *  know the shader_type, so it doesn't try to match the card's tint.
   *  Card / row rendering uses the actual type tint elsewhere. */
  color?: string;
  className?: string;
  disabled?: boolean;
}

export function PatternPicker({
  value,
  onChange,
  color,
  className,
  disabled,
}: Props) {
  return (
    <ul
      className={`grid grid-cols-5 gap-2 ${className ?? ""}`}
      role="radiogroup"
      aria-label="Card pattern"
    >
      {SHADER_PATTERN_LIST.map((def) => {
        const isActive = value === def.id;
        return (
          <li key={def.id}>
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={def.label}
              title={def.label}
              disabled={disabled}
              onClick={() => onChange(def.id)}
              className={`group relative flex aspect-[5/3] w-full items-end overflow-hidden border-2 bg-neutral-950 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? "border-emerald-500"
                  : "border-neutral-800 hover:border-neutral-600"
              }`}
            >
              <PatternBackdrop
                pattern={def.id}
                color={color ?? "#34d399"}
                opacity={isActive ? 0.55 : 0.35}
                className="absolute inset-0 size-full"
              />
              <span
                className={`relative z-10 w-full bg-gradient-to-t from-neutral-950 via-neutral-950/80 to-transparent px-1.5 py-1 text-left font-mono text-[9px] uppercase tracking-wider ${
                  isActive ? "text-emerald-300" : "text-neutral-400 group-hover:text-neutral-300"
                }`}
              >
                {def.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
