// Pixel-art SVG placeholders used wherever an asset is missing. Single fill
// (currentColor) so the surrounding text color tints them; varying opacity
// gives shape definition without needing extra colors. shapeRendering is
// crispEdges everywhere so the rectangles render as pixels (no anti-aliasing).
//
// Each variant has a fixed aspect via viewBox; size is controlled by the
// className prop (`size-10`, `size-14`, `w-full max-h-36`, etc.) so the same
// SVG can render at any size while staying pixel-perfect.

import type { ReactElement } from "react";

interface BaseProps {
  className?: string;
  title?: string;
}

// Square 16x16 — robot face. Used for NPC portraits + quest-giver thumbs.
export function PortraitPlaceholder({
  className = "",
  title = "No portrait",
}: BaseProps): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={`${className} shrink-0 rounded border border-dashed border-current/40 bg-neutral-950/50`}
      style={{ color: "var(--color-neutral-500)" }}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Antenna */}
      <rect x="7" y="0" width="2" height="1" fill="currentColor" opacity="0.8" />
      <rect x="7" y="1" width="2" height="2" fill="currentColor" opacity="0.5" />
      {/* Head outline */}
      <rect x="3" y="3" width="10" height="10" fill="currentColor" opacity="0.18" />
      <rect x="3" y="3" width="10" height="1" fill="currentColor" opacity="0.6" />
      <rect x="3" y="12" width="10" height="1" fill="currentColor" opacity="0.6" />
      <rect x="3" y="3" width="1" height="10" fill="currentColor" opacity="0.6" />
      <rect x="12" y="3" width="1" height="10" fill="currentColor" opacity="0.6" />
      {/* Eyes */}
      <rect x="5" y="6" width="2" height="2" fill="currentColor" opacity="0.85" />
      <rect x="9" y="6" width="2" height="2" fill="currentColor" opacity="0.85" />
      {/* Mouth */}
      <rect x="6" y="10" width="4" height="1" fill="currentColor" opacity="0.7" />
      {/* Cheek bolts */}
      <rect x="3" y="8" width="1" height="1" fill="currentColor" opacity="0.8" />
      <rect x="12" y="8" width="1" height="1" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

// Square 16x16 — chunky cube/crate. Used for missing item icons.
export function IconPlaceholder({
  className = "",
  title = "No icon",
}: BaseProps): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={`${className} shrink-0 rounded border border-dashed border-current/40 bg-neutral-950/50`}
      style={{ color: "var(--color-neutral-500)" }}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Body */}
      <rect x="3" y="4" width="10" height="9" fill="currentColor" opacity="0.18" />
      {/* Top edge (highlight) */}
      <rect x="3" y="4" width="10" height="1" fill="currentColor" opacity="0.7" />
      {/* Bottom edge */}
      <rect x="3" y="12" width="10" height="1" fill="currentColor" opacity="0.6" />
      {/* Side edges */}
      <rect x="3" y="4" width="1" height="9" fill="currentColor" opacity="0.6" />
      <rect x="12" y="4" width="1" height="9" fill="currentColor" opacity="0.6" />
      {/* Horizontal lid line */}
      <rect x="3" y="7" width="10" height="1" fill="currentColor" opacity="0.5" />
      {/* Lock plate */}
      <rect x="7" y="6" width="2" height="3" fill="currentColor" opacity="0.7" />
      <rect x="7" y="9" width="2" height="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

// Square 16x16 — geometric brand mark. Used for missing logos (e.g. concept).
export function LogoPlaceholder({
  className = "",
  title = "No logo",
}: BaseProps): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={`${className} shrink-0 rounded border border-dashed border-current/40 bg-neutral-950/50`}
      style={{ color: "var(--color-neutral-500)" }}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Outer frame */}
      <rect x="2" y="2" width="12" height="2" fill="currentColor" opacity="0.7" />
      <rect x="2" y="12" width="12" height="2" fill="currentColor" opacity="0.7" />
      <rect x="2" y="2" width="2" height="12" fill="currentColor" opacity="0.7" />
      <rect x="12" y="2" width="2" height="12" fill="currentColor" opacity="0.7" />
      {/* Inner field */}
      <rect x="4" y="4" width="8" height="8" fill="currentColor" opacity="0.15" />
      {/* Center mark — diamond */}
      <rect x="7" y="6" width="2" height="2" fill="currentColor" opacity="0.85" />
      <rect x="6" y="7" width="1" height="2" fill="currentColor" opacity="0.7" />
      <rect x="9" y="7" width="1" height="2" fill="currentColor" opacity="0.7" />
      <rect x="7" y="8" width="2" height="2" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

// Wide 32x12 landscape — pixel mountains + ground. Used for missing banners
// (faction page) and splash images (concept page).
export function BannerPlaceholder({
  className = "",
  title = "No image",
}: BaseProps): ReactElement {
  return (
    <svg
      viewBox="0 0 32 12"
      shapeRendering="crispEdges"
      preserveAspectRatio="none"
      className={`${className} block rounded border border-dashed border-current/40 bg-neutral-950/50`}
      style={{ color: "var(--color-neutral-500)" }}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Sky gradient (faked with bands) */}
      <rect x="0" y="0" width="32" height="2" fill="currentColor" opacity="0.05" />
      <rect x="0" y="2" width="32" height="3" fill="currentColor" opacity="0.1" />
      {/* Distant peaks (lighter) */}
      <rect x="2" y="5" width="2" height="2" fill="currentColor" opacity="0.25" />
      <rect x="4" y="4" width="3" height="3" fill="currentColor" opacity="0.25" />
      <rect x="7" y="5" width="2" height="2" fill="currentColor" opacity="0.25" />
      <rect x="22" y="4" width="3" height="3" fill="currentColor" opacity="0.25" />
      <rect x="25" y="5" width="2" height="2" fill="currentColor" opacity="0.25" />
      {/* Sun */}
      <rect x="14" y="3" width="4" height="3" fill="currentColor" opacity="0.55" />
      <rect x="13" y="4" width="1" height="1" fill="currentColor" opacity="0.55" />
      <rect x="18" y="4" width="1" height="1" fill="currentColor" opacity="0.55" />
      {/* Mid mountains */}
      <rect x="0" y="7" width="3" height="2" fill="currentColor" opacity="0.45" />
      <rect x="3" y="6" width="3" height="3" fill="currentColor" opacity="0.45" />
      <rect x="6" y="7" width="3" height="2" fill="currentColor" opacity="0.45" />
      <rect x="9" y="6" width="2" height="3" fill="currentColor" opacity="0.45" />
      <rect x="11" y="8" width="3" height="1" fill="currentColor" opacity="0.45" />
      <rect x="14" y="6" width="4" height="3" fill="currentColor" opacity="0.45" />
      <rect x="18" y="7" width="3" height="2" fill="currentColor" opacity="0.45" />
      <rect x="21" y="6" width="3" height="3" fill="currentColor" opacity="0.45" />
      <rect x="24" y="7" width="3" height="2" fill="currentColor" opacity="0.45" />
      <rect x="27" y="6" width="3" height="3" fill="currentColor" opacity="0.45" />
      <rect x="30" y="7" width="2" height="2" fill="currentColor" opacity="0.45" />
      {/* Ground */}
      <rect x="0" y="9" width="32" height="3" fill="currentColor" opacity="0.6" />
      {/* Specks of ruins */}
      <rect x="6" y="8" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="20" y="8" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="27" y="8" width="1" height="1" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
