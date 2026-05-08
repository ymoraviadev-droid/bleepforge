interface GearIconProps {
  size?: number;
  className?: string;
}

/**
 * Pixel-art gear icon. Drawn on a 12x12 grid with a single-pixel "step" along
 * each tooth so it reads as chunky pixel art (not anti-aliased smooth SVG).
 * The shape is a union of the four cross-arm rectangles + the central body
 * minus the inner square.
 */
export function GearIcon({ size = 18, className = "" }: GearIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Cross arms (the four teeth). */}
      <rect x="5" y="0" width="2" height="12" fill="currentColor" />
      <rect x="0" y="5" width="12" height="2" fill="currentColor" />
      {/* Diagonal teeth (8 small squares, 1px each). */}
      <rect x="2" y="2" width="1" height="1" fill="currentColor" />
      <rect x="9" y="2" width="1" height="1" fill="currentColor" />
      <rect x="2" y="9" width="1" height="1" fill="currentColor" />
      <rect x="9" y="9" width="1" height="1" fill="currentColor" />
      {/* Body — a 6x6 square in the center with a 2x2 hole. */}
      <rect x="3" y="3" width="6" height="6" fill="currentColor" />
      <rect x="5" y="5" width="2" height="2" fill="var(--gear-hole, #000)" />
    </svg>
  );
}
