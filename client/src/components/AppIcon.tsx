// Bleepforge app icon, rendered as inline SVG so it ships zero bytes of
// extra runtime cost and scales crisply at any size. Same artwork as
// electron/build-resources/icon.svg (the file Electron / the AppImage
// pick up for the OS-level icon) — kept here as a parallel hand-port
// rather than fetched from /public so the splash paints from frame 1
// without waiting on a network round-trip.
//
// 64×64 pixel-art grid: an emerald speech bubble centered on a dark
// canvas with a single bright blip at its visual center — the bleep.
// One element, two-tone, semantic. The blip is always exactly one
// source pixel of the 64×64 canvas (4×4 here = 1×1 at 16px) so it
// stays a tiny perfect signal at every output size. The 4px-thick
// outline survives nearest-neighbor downscale to 16px as a clean
// 1-pixel line. Pixel tail hangs off the bottom-left to match the
// BalloonCard's speech-bubble tail direction.

interface Props {
  className?: string;
}

export function AppIcon({ className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Bleepforge"
    >
      <defs>
        <radialGradient id="bf-icon-bg-halo" cx="50%" cy="44%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#10b981" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="64" height="64" fill="#0a0a0a" />
      <rect width="64" height="64" fill="url(#bf-icon-bg-halo)" />

      <g shapeRendering="crispEdges">
        {/* Speech bubble outline — 48×32 outer rect, 4px stroke. */}
        <rect x="8" y="12" width="48" height="4" fill="#34d399" />
        <rect x="8" y="40" width="48" height="4" fill="#34d399" />
        <rect x="8" y="16" width="4" height="24" fill="#34d399" />
        <rect x="52" y="16" width="4" height="24" fill="#34d399" />

        {/* Top-left highlight + bottom-right shadow for dimensionality. */}
        <rect x="8" y="12" width="4" height="4" fill="#6ee7b7" />
        <rect x="52" y="40" width="4" height="4" fill="#059669" />

        {/* Tail — 5-rung pixel stair hanging from bottom-left. */}
        <rect x="12" y="44" width="20" height="4" fill="#34d399" />
        <rect x="12" y="48" width="16" height="4" fill="#34d399" />
        <rect x="12" y="52" width="12" height="4" fill="#34d399" />
        <rect x="12" y="56" width="8" height="4" fill="#34d399" />
        <rect x="12" y="60" width="4" height="4" fill="#34d399" />

        {/* THE bleep — single 4×4 emerald-200 block at bubble center. */}
        <rect x="30" y="26" width="4" height="4" fill="#6ee7b7" />
      </g>
    </svg>
  );
}
