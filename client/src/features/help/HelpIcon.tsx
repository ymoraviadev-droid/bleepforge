interface HelpIconProps {
  size?: number;
  className?: string;
}

/**
 * Pixel-art help icon. A bordered question mark drawn on a 12x12 grid,
 * matching the GearIcon and DiagnosticsIcon construction style: single
 * fill via currentColor, crispEdges shapeRendering. Reads as "?" inside
 * a frame at any size from 12px upward.
 */
export function HelpIcon({ size = 18, className = "" }: HelpIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Outer bordered frame, two pixels thick on the corners. */}
      <rect x="1" y="0" width="10" height="1" fill="currentColor" />
      <rect x="1" y="11" width="10" height="1" fill="currentColor" />
      <rect x="0" y="1" width="1" height="10" fill="currentColor" />
      <rect x="11" y="1" width="1" height="10" fill="currentColor" />
      {/* Question-mark hook: top bar + right shaft + middle hook. */}
      <rect x="4" y="2" width="4" height="1" fill="currentColor" />
      <rect x="7" y="3" width="1" height="2" fill="currentColor" />
      <rect x="6" y="5" width="1" height="1" fill="currentColor" />
      <rect x="5" y="6" width="1" height="2" fill="currentColor" />
      {/* Dot. */}
      <rect x="5" y="9" width="1" height="1" fill="currentColor" />
    </svg>
  );
}
