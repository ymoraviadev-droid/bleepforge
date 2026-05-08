interface DiagnosticsIconProps {
  size?: number;
  className?: string;
}

/**
 * Pixel-art pulse waveform — the diagnostics indicator. Mirrors GearIcon's
 * style (12x12 grid, currentColor strokes, crispEdges) so the two icons sit
 * comfortably next to each other in the header.
 *
 * Shape walks left-to-right: baseline → spike up → return → drop to trough
 * → baseline. Reads as "system status / liveness" without being literally
 * medical.
 */
export function DiagnosticsIcon({ size = 18, className = "" }: DiagnosticsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Left baseline + base of peak (y=5, x=0..6). */}
      <rect x="0" y="5" width="7" height="1" fill="currentColor" />
      {/* Peak vertical (x=5, y=2..4). */}
      <rect x="5" y="2" width="1" height="3" fill="currentColor" />
      {/* Down stroke after peak (x=6, y=6..8). */}
      <rect x="6" y="6" width="1" height="3" fill="currentColor" />
      {/* Trough bottom (y=8, x=7..9). */}
      <rect x="7" y="8" width="3" height="1" fill="currentColor" />
      {/* Recovery vertical (x=9, y=6..8). */}
      <rect x="9" y="6" width="1" height="3" fill="currentColor" />
      {/* Right baseline (y=5, x=9..11). */}
      <rect x="9" y="5" width="3" height="1" fill="currentColor" />
    </svg>
  );
}
