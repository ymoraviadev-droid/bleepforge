import type { ReactNode } from "react";
import { PixelSlider } from "./PixelSlider";
import { fieldLabel } from "../styles/classes";

interface SliderFieldProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
  className?: string;
}

export function SliderField({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  hint,
  className,
}: SliderFieldProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={fieldLabel}>{label}</span>
        <span className="font-mono tabular-nums text-xs text-neutral-300">
          {display}
        </span>
      </div>
      <PixelSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        aria-label={label}
      />
      {hint && <p className="text-[10px] text-neutral-600">{hint}</p>}
    </div>
  );
}
