import { useId, type ReactNode } from "react";
import {
  SHADER_PATTERN_IDS,
  type ShaderPattern,
} from "@bleepforge/shared";

// Bleepforge-only card patterns. Each one is a tiling SVG backdrop drawn
// on the shader card / row / edit page so the user can pick a visual
// identity per shader. All patterns use `currentColor` for the fill, so
// the per-shader_type tint (lime / cyan / orange / blue / slate) carries
// through naturally — the pattern shape is the variable, the hue is the
// type-cue.
//
// 10 patterns. Designed at the pixel-grid level (tile sizes 4–10 px,
// shapeRendering="crispEdges") to match the rest of the app's pixel-art
// aesthetic. Each tile is structured so it tiles seamlessly — the right
// edge connects to the left, the bottom to the top — verified by eye
// for each design.

interface PatternDef {
  id: ShaderPattern;
  /** Display label in the picker. */
  label: string;
  /** Edge length of the SVG pattern tile in user-space units. */
  tileSize: number;
  /** One-tile body — a fragment of <rect> / <path> / etc. children. */
  Tile: () => ReactNode;
}

// ---- The 10 patterns ------------------------------------------------------

const Scanlines: PatternDef = {
  id: "scanlines",
  label: "Scanlines",
  tileSize: 4,
  Tile: () => <rect x="0" y="0" width="4" height="1" fill="currentColor" />,
};

const Bars: PatternDef = {
  id: "bars",
  label: "Bars",
  tileSize: 4,
  Tile: () => <rect x="0" y="0" width="1" height="4" fill="currentColor" />,
};

const Grid: PatternDef = {
  id: "grid",
  label: "Grid",
  tileSize: 5,
  Tile: () => <rect x="0" y="0" width="1" height="1" fill="currentColor" />,
};

const Lattice: PatternDef = {
  id: "lattice",
  label: "Lattice",
  tileSize: 8,
  // Two diagonals: \ and / made of single-pixel rects. Tile origin is
  // top-left; \ runs (0,0)→(7,7), / runs (7,0)→(0,7). They cross at the
  // tile center. Tiled, this forms a diamond mesh.
  Tile: () => (
    <g fill="currentColor">
      {/* \ diagonal */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={`a${i}`} x={i} y={i} width="1" height="1" />
      ))}
      {/* / diagonal — skip the center pixel so they share only one cell */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={`b${i}`} x={7 - i} y={i} width="1" height="1" />
      ))}
    </g>
  ),
};

const Diagonal: PatternDef = {
  id: "diagonal",
  label: "Diagonal",
  tileSize: 5,
  // Single \ diagonal of pixel-rects. Tiled, it forms a clean
  // 45-degree pixel-stair pattern.
  Tile: () => (
    <g fill="currentColor">
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={i} y={i} width="1" height="1" />
      ))}
    </g>
  ),
};

const Waveform: PatternDef = {
  id: "waveform",
  label: "Waveform",
  tileSize: 8,
  // Stepped square wave: top half on left 4 pixels, bottom half on right
  // 4 pixels, with a 1px connector at the transition. Tiled horizontally
  // produces an alternating up-down rhythm; tiled vertically just
  // repeats the same wave at a fixed Y, which reads as a signal trace.
  Tile: () => (
    <g fill="currentColor">
      <rect x="0" y="0" width="4" height="1" />
      <rect x="3" y="0" width="1" height="4" />
      <rect x="3" y="3" width="5" height="1" />
    </g>
  ),
};

const Rings: PatternDef = {
  id: "rings",
  label: "Rings",
  tileSize: 10,
  // Two concentric hollow squares per tile. Outer at the tile border;
  // inner at offset (3,3) with size 4. Drawn as 4 filled rects per
  // square (top, bottom, left, right edges) rather than stroked rects,
  // so the corners stay crisp under shapeRendering="crispEdges".
  Tile: () => (
    <g fill="currentColor">
      {/* Outer ring */}
      <rect x="0" y="0" width="10" height="1" />
      <rect x="0" y="9" width="10" height="1" />
      <rect x="0" y="0" width="1" height="10" />
      <rect x="9" y="0" width="1" height="10" />
      {/* Inner ring */}
      <rect x="3" y="3" width="4" height="1" />
      <rect x="3" y="6" width="4" height="1" />
      <rect x="3" y="3" width="1" height="4" />
      <rect x="6" y="3" width="1" height="4" />
    </g>
  ),
};

const Bricks: PatternDef = {
  id: "bricks",
  label: "Bricks",
  tileSize: 8,
  // 8x8 tile carrying two rows of bricks, offset. Horizontal mortar
  // lines at y=0 and y=4; vertical separators at x=4 (top row) and
  // x=0 (bottom row, offset). Classic running-bond brick wall when
  // tiled.
  Tile: () => (
    <g fill="currentColor">
      <rect x="0" y="0" width="8" height="1" />
      <rect x="0" y="4" width="8" height="1" />
      <rect x="4" y="0" width="1" height="4" />
      <rect x="0" y="4" width="1" height="4" />
    </g>
  ),
};

const Circuit: PatternDef = {
  id: "circuit",
  label: "Circuit",
  tileSize: 8,
  // Two L-shaped traces per tile, rotated 180° relative to each other,
  // in opposite corners. Each L: a 3-pixel horizontal segment + a
  // 3-pixel vertical segment meeting at the corner.
  Tile: () => (
    <g fill="currentColor">
      {/* Top-left L: ⌐ */}
      <rect x="1" y="1" width="3" height="1" />
      <rect x="1" y="1" width="1" height="3" />
      {/* Bottom-right L: ⌐ rotated → ⌙ */}
      <rect x="4" y="6" width="3" height="1" />
      <rect x="6" y="4" width="1" height="3" />
    </g>
  ),
};

const Stars: PatternDef = {
  id: "stars",
  label: "Stars",
  tileSize: 8,
  // Two 3×3 plus-sign sparks per tile, scattered. Each plus is a
  // vertical 3-pixel bar plus a horizontal 3-pixel bar crossing at the
  // center. Positioned at (1,1) and (5,5) so they don't overlap and
  // tile cleanly.
  Tile: () => (
    <g fill="currentColor">
      {/* Plus 1 at center (1,1) */}
      <rect x="1" y="0" width="1" height="3" />
      <rect x="0" y="1" width="3" height="1" />
      {/* Plus 2 at center (5,5) */}
      <rect x="5" y="4" width="1" height="3" />
      <rect x="4" y="5" width="3" height="1" />
    </g>
  ),
};

// ---- Registry --------------------------------------------------------------

export const SHADER_PATTERN_DEFS: Record<ShaderPattern, PatternDef> = {
  scanlines: Scanlines,
  bars: Bars,
  grid: Grid,
  lattice: Lattice,
  diagonal: Diagonal,
  waveform: Waveform,
  rings: Rings,
  bricks: Bricks,
  circuit: Circuit,
  stars: Stars,
};

/** Picker iteration order matches SHADER_PATTERN_IDS (shared schema). */
export const SHADER_PATTERN_LIST: PatternDef[] = SHADER_PATTERN_IDS.map(
  (id) => SHADER_PATTERN_DEFS[id],
);

/** Fallback pattern when a shader's pattern field is null (server-side
 *  default isn't set yet, or the shader pre-dates this feature). */
export const DEFAULT_SHADER_PATTERN: ShaderPattern = "scanlines";

// ---- Backdrop component ----------------------------------------------------

interface BackdropProps {
  pattern: ShaderPattern | null;
  className?: string;
  /** Override the inherited color (useful for the picker where each
   *  swatch should show the pattern in a fixed accent). Default: inherit
   *  via `currentColor`. */
  color?: string;
  /** Pattern fill opacity (multiplicative on the currentColor). Default
   *  is 0.18 — soft enough to read as backdrop, dense enough to identify. */
  opacity?: number;
}

export function PatternBackdrop({
  pattern,
  className,
  color,
  opacity = 0.18,
}: BackdropProps) {
  const baseId = useId();
  const def = SHADER_PATTERN_DEFS[pattern ?? DEFAULT_SHADER_PATTERN];
  // useId() returns ":r0:" form which isn't valid in url(#…) on some
  // browsers — sanitize to alnum.
  const patternId = `bf-pat-${baseId.replace(/[^a-zA-Z0-9]/g, "")}-${def.id}`;
  return (
    <svg
      className={className}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={color ? { color } : undefined}
      aria-hidden
    >
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={def.tileSize}
          height={def.tileSize}
        >
          <g opacity={opacity}>
            <def.Tile />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
