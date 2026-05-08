import type { CSSProperties } from "react";

interface PixelSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  className?: string;
  "aria-label"?: string;
}

export function PixelSlider({
  min,
  max,
  step,
  value,
  onChange,
  className,
  ...rest
}: PixelSliderProps) {
  // Clamp [0, 100] — float fuzz at the extremes would otherwise push the fill
  // mask past the track border by a fractional pixel.
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`pixel-range${className ? ` ${className}` : ""}`}
      style={{ "--pct": `${pct}%` } as CSSProperties}
      {...rest}
    />
  );
}
