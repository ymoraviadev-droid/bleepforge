import { SHADER_CARD_COLORS, type ShaderCardColor } from "@bleepforge/shared";

import type { ShaderType } from "../../lib/api";
import { shaderColorStyle, shaderTypeLabel, shaderTypeStyle } from "./format";

// Solid-dot tint per palette. Stronger hue than the swatch backdrop
// (which uses -950/40) so the dot reads as the "real color" pop. Spelled
// out as literals because Tailwind's JIT scanner can't follow dynamic
// class concatenation.
const DOT: Record<ShaderCardColor, string> = {
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
  blue: "bg-blue-400",
  violet: "bg-violet-400",
  cyan: "bg-cyan-400",
  orange: "bg-orange-400",
  pink: "bg-pink-400",
  lime: "bg-lime-400",
};

// Grid of card-color swatches. 9 palette colors plus an "Auto" swatch
// that previews the shader_type's default tint (canvas_item → lime,
// spatial → cyan, etc.). Picking Auto clears the override; picking any
// palette swatch sets it.
//
// Used in two places — same shape as PatternPicker:
//   - NewShaderModal: pick a color at creation time (defaults to Auto).
//   - Edit page sidebar: change the color at any time, saves immediately
//     via shadersApi.setColor.
//
// The Auto swatch mirrors the shader_type tint live so the user sees
// the actual fallback they'd get; only the 9 palette swatches are
// stable across themes and across the shader_type list.

interface Props {
  /** Current override; null = Auto (use shader_type tint). */
  value: ShaderCardColor | null;
  /** Setter — receives null when the user clicks Auto. */
  onChange: (next: ShaderCardColor | null) => void;
  /** Used to color the Auto swatch so the picker shows the actual
   *  fallback. Null shader_type → neutral swatch. */
  shaderType: ShaderType | null;
  className?: string;
  disabled?: boolean;
}

export function ColorPicker({
  value,
  onChange,
  shaderType,
  className,
  disabled,
}: Props) {
  const autoActive = value === null;
  const autoStyle = shaderTypeStyle(shaderType);

  return (
    <ul
      className={`grid grid-cols-5 gap-2 ${className ?? ""}`}
      role="radiogroup"
      aria-label="Card color"
    >
      {/* Auto swatch — picks up whatever the shader_type uses. Tooltip
          surfaces the resolved type label so the user can confirm what
          "Auto" means for this specific shader. */}
      <li>
        <button
          type="button"
          role="radio"
          aria-checked={autoActive}
          aria-label={`Auto (${shaderTypeLabel(shaderType)})`}
          title={`Auto — follows shader_type ${shaderTypeLabel(shaderType)}`}
          disabled={disabled}
          onClick={() => onChange(null)}
          className={`group relative flex aspect-square w-full items-center justify-center overflow-hidden border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${autoStyle.bg} ${
            autoActive
              ? "border-emerald-500"
              : "border-neutral-800 hover:border-neutral-600"
          }`}
        >
          <span
            className={`relative z-10 font-mono text-[9px] uppercase tracking-wider ${
              autoActive ? "text-emerald-300" : autoStyle.text
            }`}
          >
            Auto
          </span>
        </button>
      </li>
      {SHADER_CARD_COLORS.map((c) => {
        const isActive = value === c;
        const style = shaderColorStyle(c);
        return (
          <li key={c}>
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={c}
              title={c}
              disabled={disabled}
              onClick={() => onChange(c)}
              className={`group relative flex aspect-square w-full items-center justify-center overflow-hidden border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${style.bg} ${
                isActive
                  ? "border-emerald-500"
                  : "border-neutral-800 hover:border-neutral-600"
              }`}
            >
              {/* Solid dot of the actual palette hue so the swatch reads
                  unambiguously even at small sizes — the bg-*-950/40
                  background alone can wash out next to neighbors. */}
              <span className={`size-3 ${DOT[c]}`} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
