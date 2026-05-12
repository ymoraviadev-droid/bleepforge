interface RestartIconProps {
  size?: number;
  className?: string;
}

/**
 * Pixel-art restart icon. A hook-shaped arrow (↰): horizontal tail
 * entering from the right, 90° turn at the bottom-left, vertical shaft
 * going up, arrowhead at the top. Reads instantly as "loop back to the
 * start." Drawn on a 12x12 grid; single fill via currentColor,
 * crispEdges shapeRendering. Same construction style as HelpIcon /
 * DiagnosticsIcon / GearIcon so the four header icons read as one set.
 */
export function RestartIcon({ size = 18, className = "" }: RestartIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Arrow tip — single pixel at the top. */}
      <rect x="3" y="1" width="1" height="1" fill="currentColor" />
      {/* Arrowhead wings — three pixels under the tip. */}
      <rect x="2" y="2" width="3" height="1" fill="currentColor" />
      {/* Vertical shaft running from the wings down to the elbow. */}
      <rect x="3" y="3" width="1" height="5" fill="currentColor" />
      {/* Horizontal tail running from the elbow out to the right. */}
      <rect x="3" y="8" width="8" height="1" fill="currentColor" />
    </svg>
  );
}
