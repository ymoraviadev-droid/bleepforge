// Bleepforge app icon, rendered as inline SVG so it ships zero bytes of
// extra runtime cost and scales crisply at any size. Same artwork as
// electron/build-resources/icon.svg (the file Electron / the AppImage
// pick up for the OS-level icon) — kept here as a parallel hand-port
// rather than fetched from /public so the splash paints from frame 1
// without waiting on a network round-trip.
//
// 64×64 pixel-art grid: anvil silhouette grounded in the lower half,
// an emerald speech-balloon "bleep" hovering above (freshly forged),
// sparks frozen in the gap between them. Reads at every icon size —
// the anvil silhouette + emerald glow are the load-bearing visual
// cues that survive even at 16×16.

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
        <radialGradient id="bf-icon-bg-halo" cx="50%" cy="38%" r="55%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.20" />
          <stop offset="55%" stopColor="#10b981" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bf-icon-bleep-glow" cx="50%" cy="27%" r="26%">
          <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.40" />
          <stop offset="50%" stopColor="#34d399" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="64" height="64" fill="#0a0a0a" />
      <rect width="64" height="64" fill="url(#bf-icon-bg-halo)" />
      <rect width="64" height="64" fill="url(#bf-icon-bleep-glow)" />

      <g shapeRendering="crispEdges">
        {/* Anvil — top face */}
        <rect x="16" y="38" width="28" height="3" fill="#737373" />
        <rect x="16" y="38" width="28" height="1" fill="#a3a3a3" />
        <rect x="26" y="38" width="12" height="1" fill="#34d399" opacity="0.55" />
        <rect x="16" y="40" width="28" height="1" fill="#525252" />

        {/* Anvil — horn */}
        <rect x="44" y="38" width="3" height="3" fill="#737373" />
        <rect x="44" y="38" width="3" height="1" fill="#a3a3a3" />
        <rect x="44" y="40" width="3" height="1" fill="#525252" />
        <rect x="47" y="38" width="2" height="2" fill="#737373" />
        <rect x="47" y="38" width="2" height="1" fill="#a3a3a3" />
        <rect x="49" y="38" width="1" height="1" fill="#a3a3a3" />

        {/* Anvil — chamfer */}
        <rect x="18" y="41" width="24" height="1" fill="#525252" />
        <rect x="20" y="42" width="20" height="1" fill="#404040" />

        {/* Anvil — throat */}
        <rect x="26" y="43" width="12" height="5" fill="#525252" />
        <rect x="26" y="43" width="12" height="1" fill="#404040" />
        <rect x="26" y="43" width="1" height="5" fill="#404040" />
        <rect x="37" y="43" width="1" height="5" fill="#404040" />

        {/* Anvil — foot flare */}
        <rect x="24" y="48" width="16" height="1" fill="#525252" />
        <rect x="22" y="49" width="20" height="1" fill="#525252" />

        {/* Anvil — base */}
        <rect x="20" y="50" width="24" height="5" fill="#525252" />
        <rect x="20" y="50" width="24" height="1" fill="#737373" />
        <rect x="20" y="54" width="24" height="1" fill="#404040" />

        {/* Anvil — ground lip */}
        <rect x="18" y="55" width="28" height="2" fill="#404040" />
        <rect x="18" y="55" width="28" height="1" fill="#525252" />

        {/* Bleep — body + chamfered corners */}
        <rect x="23" y="13" width="18" height="9" fill="#34d399" />
        <rect x="23" y="13" width="1" height="1" fill="#0a0a0a" />
        <rect x="40" y="13" width="1" height="1" fill="#0a0a0a" />
        <rect x="23" y="21" width="1" height="1" fill="#0a0a0a" />
        <rect x="40" y="21" width="1" height="1" fill="#0a0a0a" />

        {/* Bleep — top + left highlight */}
        <rect x="24" y="13" width="16" height="1" fill="#6ee7b7" />
        <rect x="23" y="14" width="1" height="7" fill="#6ee7b7" />

        {/* Bleep — bottom + right shadow */}
        <rect x="24" y="21" width="16" height="1" fill="#059669" />
        <rect x="40" y="14" width="1" height="7" fill="#059669" />

        {/* Bleep — tail */}
        <rect x="33" y="22" width="3" height="1" fill="#34d399" />
        <rect x="34" y="23" width="2" height="1" fill="#10b981" />
        <rect x="35" y="24" width="1" height="1" fill="#10b981" />

        {/* Bleep — sound dots */}
        <rect x="27" y="17" width="2" height="2" fill="#ecfdf5" />
        <rect x="31" y="17" width="2" height="2" fill="#ecfdf5" />
        <rect x="35" y="17" width="2" height="2" fill="#ecfdf5" />

        {/* Sparks — impact center */}
        <rect x="31" y="35" width="2" height="2" fill="#a7f3d0" />
        <rect x="31" y="35" width="1" height="1" fill="#ecfdf5" />

        {/* Sparks — outer belt */}
        <rect x="20" y="29" width="1" height="1" fill="#6ee7b7" />
        <rect x="43" y="27" width="1" height="1" fill="#6ee7b7" />
        <rect x="17" y="34" width="1" height="1" fill="#34d399" />
        <rect x="46" y="33" width="1" height="1" fill="#34d399" />
        <rect x="15" y="38" width="1" height="1" fill="#34d399" />
        <rect x="49" y="36" width="1" height="1" fill="#34d399" />
        <rect x="24" y="31" width="1" height="1" fill="#6ee7b7" />
        <rect x="40" y="29" width="1" height="1" fill="#6ee7b7" />
        <rect x="27" y="28" width="1" height="1" fill="#a7f3d0" />
        <rect x="38" y="27" width="1" height="1" fill="#a7f3d0" />
        <rect x="22" y="33" width="1" height="1" fill="#34d399" />
        <rect x="42" y="35" width="1" height="1" fill="#34d399" />
      </g>
    </svg>
  );
}
