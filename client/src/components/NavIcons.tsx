// Eleven pixel-art nav icons — one per domain on the sidebar. Same
// 12×12 grid + crispEdges + currentColor convention as the existing
// meta icons (Gear / Help / Restart / Diagnostics) so the whole sidebar
// reads as one icon family. Default render size is 16px so each icon
// sits at roughly text-cap-height next to its label.
//
// Designed at silhouette level — the user reads the shape before they
// read internal detail. Per-domain rationale lives next to each
// component below.
//
// Picking discussed in Phase 3 planning: house, shield, robot head,
// scroll, balance scale, speech bubble, small bubble with dots, crate,
// scanline frame, open book, picture frame. Factions went shield over
// "three figures" — at 12×12 the figures became unreadable specks;
// shield is iconic at any size. Shaders went scanline-frame over a
// diamond — direct callback to the card pattern overlay everywhere
// else on the surface.

interface IconProps {
  size?: number;
  className?: string;
}

function Wrap({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">{children}</g>
    </svg>
  );
}

// ---- Game concept: pixel house with peaked roof + door silhouette ----

export function HouseIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Roof — pyramid stack, 1px wider per row from peak to eaves. */}
      <rect x="5" y="0" width="2" height="1" />
      <rect x="4" y="1" width="4" height="1" />
      <rect x="3" y="2" width="6" height="1" />
      <rect x="2" y="3" width="8" height="1" />
      <rect x="1" y="4" width="10" height="1" />
      {/* Body top — full width across the house body. */}
      <rect x="2" y="5" width="8" height="2" />
      {/* Door cutout — leave x=5,6 empty between the side walls. */}
      <rect x="2" y="7" width="3" height="3" />
      <rect x="7" y="7" width="3" height="3" />
      {/* Foundation. */}
      <rect x="2" y="10" width="8" height="1" />
    </Wrap>
  );
}

// ---- Factions: shield silhouette, tapered to a point at the bottom ----

export function ShieldIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      <rect x="2" y="0" width="8" height="1" />
      <rect x="1" y="1" width="10" height="5" />
      <rect x="2" y="6" width="8" height="1" />
      <rect x="2" y="7" width="8" height="1" />
      <rect x="3" y="8" width="6" height="1" />
      <rect x="4" y="9" width="4" height="1" />
      <rect x="5" y="10" width="2" height="1" />
    </Wrap>
  );
}

// ---- NPCs: robot head with antenna + two eyes + mouth grille ----

export function RobotIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Antenna — single column of pixels topping the head. */}
      <rect x="6" y="0" width="1" height="2" />
      {/* Head top — slightly narrower than the body row below. */}
      <rect x="3" y="2" width="7" height="1" />
      {/* Body — full head width. */}
      <rect x="2" y="3" width="9" height="1" />
      {/* Eye row — two cutouts (x=4-5 and x=7-8) leaving cheeks + pillar. */}
      <rect x="2" y="4" width="2" height="2" />
      <rect x="6" y="4" width="1" height="2" />
      <rect x="9" y="4" width="2" height="2" />
      {/* Lower face. */}
      <rect x="2" y="6" width="9" height="2" />
      {/* Mouth slot — gap in middle of row 8. */}
      <rect x="2" y="8" width="3" height="1" />
      <rect x="8" y="8" width="3" height="1" />
      {/* Chin. */}
      <rect x="2" y="9" width="9" height="1" />
      <rect x="3" y="10" width="7" height="1" />
    </Wrap>
  );
}

// ---- Quests: scroll with curled top/bottom + 3 text lines ----

export function ScrollIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Top curl — single recessed pixel row. */}
      <rect x="1" y="0" width="10" height="1" />
      {/* Top frame band. */}
      <rect x="0" y="1" width="12" height="1" />
      {/* Side walls — full height through the paper body. */}
      <rect x="0" y="2" width="2" height="7" />
      <rect x="10" y="2" width="2" height="7" />
      {/* Three text lines — evenly spaced inside the paper. */}
      <rect x="3" y="3" width="6" height="1" />
      <rect x="3" y="5" width="6" height="1" />
      <rect x="3" y="7" width="6" height="1" />
      {/* Bottom frame band + curl. */}
      <rect x="0" y="9" width="12" height="1" />
      <rect x="1" y="10" width="10" height="1" />
    </Wrap>
  );
}

// ---- Karma: balance scale with beam + 2 pans + center post + base ----

export function ScaleIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Top of post — 1px finial above the beam. */}
      <rect x="6" y="0" width="1" height="1" />
      {/* Beam — horizontal bar across the top. */}
      <rect x="2" y="1" width="9" height="1" />
      {/* String drops + post column. */}
      <rect x="1" y="2" width="1" height="1" />
      <rect x="6" y="2" width="1" height="1" />
      <rect x="11" y="2" width="1" height="1" />
      {/* Pans — left + right, with the post column linking them. */}
      <rect x="0" y="3" width="3" height="1" />
      <rect x="6" y="3" width="1" height="1" />
      <rect x="9" y="3" width="3" height="1" />
      {/* Post body. */}
      <rect x="6" y="4" width="1" height="4" />
      {/* Base — tapered foot. */}
      <rect x="4" y="8" width="5" height="1" />
      <rect x="3" y="9" width="7" height="1" />
    </Wrap>
  );
}

// ---- Dialogs: speech bubble with text lines + tail bottom-left ----

export function BubbleIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Bubble top — recessed corners. */}
      <rect x="1" y="0" width="10" height="1" />
      <rect x="0" y="1" width="12" height="1" />
      {/* Side walls. */}
      <rect x="0" y="2" width="2" height="5" />
      <rect x="10" y="2" width="2" height="5" />
      {/* Two text lines inside. */}
      <rect x="3" y="3" width="6" height="1" />
      <rect x="3" y="5" width="6" height="1" />
      {/* Bubble bottom. */}
      <rect x="0" y="7" width="12" height="1" />
      <rect x="1" y="8" width="10" height="1" />
      {/* Tail — drops bottom-left, two-step stair. */}
      <rect x="0" y="9" width="2" height="1" />
      <rect x="0" y="10" width="1" height="1" />
    </Wrap>
  );
}

// ---- Balloons: smaller bubble + 3 ambient "…" dots + tail ----

export function BalloonIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Smaller bubble (8 wide vs Dialog's 10) with three dots. */}
      <rect x="2" y="0" width="8" height="1" />
      <rect x="1" y="1" width="10" height="1" />
      <rect x="1" y="2" width="2" height="3" />
      <rect x="9" y="2" width="2" height="3" />
      {/* Three dots in the centerline — say "ambient chatter". */}
      <rect x="3" y="3" width="1" height="1" />
      <rect x="5" y="3" width="1" height="1" />
      <rect x="7" y="3" width="1" height="1" />
      <rect x="1" y="5" width="10" height="1" />
      <rect x="2" y="6" width="8" height="1" />
      {/* Tail. */}
      <rect x="1" y="7" width="2" height="1" />
      <rect x="0" y="8" width="2" height="1" />
    </Wrap>
  );
}

// ---- Items: crate with X cross-brace inside ----

export function CrateIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Outer frame. */}
      <rect x="0" y="0" width="12" height="1" />
      <rect x="0" y="9" width="12" height="1" />
      <rect x="0" y="1" width="2" height="8" />
      <rect x="10" y="1" width="2" height="8" />
      {/* X-brace: diagonal top-left → bottom-right + top-right → bottom-left.
          Intersection at y=4-5 doubles up into a 2×2 center block. */}
      <rect x="3" y="2" width="1" height="1" />
      <rect x="8" y="2" width="1" height="1" />
      <rect x="4" y="3" width="1" height="1" />
      <rect x="7" y="3" width="1" height="1" />
      <rect x="5" y="4" width="2" height="2" />
      <rect x="4" y="6" width="1" height="1" />
      <rect x="7" y="6" width="1" height="1" />
      <rect x="3" y="7" width="1" height="1" />
      <rect x="8" y="7" width="1" height="1" />
    </Wrap>
  );
}

// ---- Shaders: square frame with internal scanlines (card-pattern callback) ----

export function ShaderIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Frame top + bottom. */}
      <rect x="1" y="1" width="10" height="1" />
      <rect x="1" y="10" width="10" height="1" />
      {/* Side walls. */}
      <rect x="1" y="2" width="1" height="8" />
      <rect x="10" y="2" width="1" height="8" />
      {/* Two internal scanlines — directly evokes the pattern overlay
          on every shader card elsewhere in the UI. */}
      <rect x="1" y="4" width="10" height="1" />
      <rect x="1" y="7" width="10" height="1" />
    </Wrap>
  );
}

// ---- Game codex: open book with center spine + text lines on each page ----

export function BookIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Top edges — slightly recessed left + right (page corners). */}
      <rect x="1" y="0" width="4" height="1" />
      <rect x="7" y="0" width="4" height="1" />
      {/* Frame top band. */}
      <rect x="0" y="1" width="12" height="1" />
      {/* Left outer edge + spine + right outer edge — three vertical
          columns running through the page body. */}
      <rect x="0" y="2" width="1" height="7" />
      <rect x="6" y="2" width="1" height="7" />
      <rect x="11" y="2" width="1" height="7" />
      {/* Three text lines on each page (left + right) at y=3, 5, 7. */}
      <rect x="2" y="3" width="3" height="1" />
      <rect x="8" y="3" width="3" height="1" />
      <rect x="2" y="5" width="3" height="1" />
      <rect x="8" y="5" width="3" height="1" />
      <rect x="2" y="7" width="3" height="1" />
      <rect x="8" y="7" width="3" height="1" />
      {/* Frame bottom band. */}
      <rect x="0" y="9" width="12" height="1" />
      {/* Bottom page edges. */}
      <rect x="1" y="10" width="4" height="1" />
      <rect x="7" y="10" width="4" height="1" />
    </Wrap>
  );
}

// ---- Workbench: flat bench surface + a hammer on top + two legs below ----

export function WorkbenchIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Hammer head, sitting on top-left of the bench. */}
      <rect x="2" y="1" width="3" height="2" />
      {/* Hammer handle — single column down to the bench top. */}
      <rect x="3" y="3" width="1" height="1" />
      {/* A second item on the bench top-right — a small block / peg. */}
      <rect x="7" y="2" width="2" height="2" />
      {/* Bench top — full width, two pixels thick. */}
      <rect x="0" y="4" width="12" height="2" />
      {/* Two leg pairs. */}
      <rect x="1" y="6" width="2" height="4" />
      <rect x="9" y="6" width="2" height="4" />
      {/* Floor bar — tiny strip at the base for grounding. */}
      <rect x="0" y="10" width="12" height="1" />
    </Wrap>
  );
}

// ---- Assets: framed picture with sun cross + mountain peak silhouette ----

export function FrameIcon(props: IconProps) {
  return (
    <Wrap {...props}>
      {/* Outer picture frame. */}
      <rect x="0" y="1" width="12" height="1" />
      <rect x="0" y="10" width="12" height="1" />
      <rect x="0" y="2" width="1" height="8" />
      <rect x="11" y="2" width="1" height="8" />
      {/* Sun — plus-cross in upper-left, 3 cells tall + 3 wide. */}
      <rect x="3" y="3" width="1" height="1" />
      <rect x="2" y="4" width="3" height="1" />
      <rect x="3" y="5" width="1" height="1" />
      {/* Mountain peak in lower-right — three-row triangle. */}
      <rect x="7" y="7" width="1" height="1" />
      <rect x="6" y="8" width="3" height="1" />
      <rect x="4" y="9" width="6" height="1" />
    </Wrap>
  );
}
