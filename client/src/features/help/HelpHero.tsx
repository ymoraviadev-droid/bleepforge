interface HelpHeroProps {
  className?: string;
}

// Pixel-art bookshelf hero, 96x56 viewBox. Two shelves: the top one holds
// eight standing books, each in one of the eight palette colors that the
// rest of the Help feature uses for category color coding. The bottom
// shelf holds a stack of books lying flat plus a magnifying glass.
//
// Visual story: the books are categories, the magnifier is search. Both
// affordances on the welcome screen are represented in the illustration.
//
// Color choices: the eight book spines are the literal Tailwind 500-shade
// palette tones (red, amber, etc.) so they stay stable across global
// theme swaps and match the category stripes the user sees in the
// sidebar. The shelf frame uses currentColor so the wood tone follows
// the parent's text color.
export function HelpHero({ className = "" }: HelpHeroProps) {
  return (
    <svg
      viewBox="0 0 96 56"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label="Pixel bookshelf with books in eight colors and a magnifying glass"
    >
      <title>Help library</title>

      {/* Floor under the shelf */}
      <rect x="0" y="53" width="96" height="1" fill="currentColor" opacity="0.45" />
      <rect x="6" y="54" width="2" height="1" fill="currentColor" opacity="0.3" />
      <rect x="42" y="55" width="2" height="1" fill="currentColor" opacity="0.3" />
      <rect x="80" y="54" width="2" height="1" fill="currentColor" opacity="0.3" />

      {/* Shelf outer frame (wood) */}
      <rect x="2" y="6" width="92" height="46" fill="currentColor" opacity="0.55" />
      {/* Inner interior (back panel, lighter) */}
      <rect x="4" y="8" width="88" height="42" fill="currentColor" opacity="0.13" />
      {/* Shelf divider between top and bottom rows */}
      <rect x="4" y="28" width="88" height="2" fill="currentColor" opacity="0.6" />
      {/* Top frame highlight */}
      <rect x="2" y="6" width="92" height="1" fill="currentColor" opacity="0.78" />
      <rect x="2" y="6" width="1" height="46" fill="currentColor" opacity="0.7" />

      {/* Top shelf: eight standing books, one per palette color. */}
      {/* Each book is roughly 7 wide x 17 tall with small height variation. */}
      <BookSpine x={7} y={11} w={7} h={17} className="text-emerald-500" />
      <BookSpine x={15} y={12} w={7} h={16} className="text-amber-500" />
      <BookSpine x={23} y={11} w={7} h={17} className="text-red-500" />
      <BookSpine x={31} y={10} w={7} h={18} className="text-blue-500" />
      <BookSpine x={39} y={12} w={7} h={16} className="text-violet-500" />
      <BookSpine x={47} y={11} w={7} h={17} className="text-cyan-500" />
      <BookSpine x={55} y={10} w={7} h={18} className="text-orange-500" />
      <BookSpine x={63} y={12} w={7} h={16} className="text-pink-500" />

      {/* Top shelf right side decoration: a small standing item.
          A tiny pixel plant rising in a pot. */}
      {/* Pot */}
      <rect x="78" y="22" width="8" height="6" fill="currentColor" opacity="0.55" />
      <rect x="78" y="22" width="8" height="1" fill="currentColor" opacity="0.75" />
      {/* Plant stems and leaves (use emerald so it reads as alive) */}
      <rect x="81" y="14" width="2" height="8" fill="currentColor" className="text-emerald-500" />
      <rect x="79" y="16" width="2" height="2" fill="currentColor" className="text-emerald-500" />
      <rect x="83" y="13" width="2" height="2" fill="currentColor" className="text-emerald-500" />
      <rect x="84" y="15" width="2" height="2" fill="currentColor" className="text-emerald-500" />

      {/* Bottom shelf: stack of books lying flat on the left. */}
      {/* Stack base */}
      <rect x="7" y="44" width="20" height="3" fill="currentColor" opacity="0.65" />
      <rect x="7" y="44" width="20" height="1" fill="currentColor" opacity="0.85" />
      {/* Stack middle */}
      <rect x="9" y="40" width="16" height="4" fill="currentColor" opacity="0.55" />
      <rect x="9" y="40" width="16" height="1" fill="currentColor" opacity="0.78" />
      {/* Stack top */}
      <rect x="11" y="36" width="12" height="4" fill="currentColor" opacity="0.45" />
      <rect x="11" y="36" width="12" height="1" fill="currentColor" opacity="0.7" />
      {/* Bookmark ribbon hanging off the top book */}
      <rect x="20" y="40" width="1" height="3" fill="currentColor" className="text-amber-500" />
      <rect x="20" y="43" width="2" height="1" fill="currentColor" className="text-amber-500" />

      {/* Bottom shelf middle: magnifying glass.
          Lens is an 8x8 frame; handle is a small slant trailing to the lower right. */}
      {/* Lens outer ring */}
      <rect x="36" y="36" width="10" height="1" fill="currentColor" opacity="0.85" />
      <rect x="36" y="44" width="10" height="1" fill="currentColor" opacity="0.85" />
      <rect x="35" y="37" width="1" height="7" fill="currentColor" opacity="0.85" />
      <rect x="46" y="37" width="1" height="7" fill="currentColor" opacity="0.85" />
      {/* Lens glass (slight tint, suggests glass) */}
      <rect x="36" y="37" width="10" height="7" fill="currentColor" opacity="0.18" />
      {/* Diagonal sparkle on the glass */}
      <rect x="38" y="38" width="2" height="1" fill="currentColor" opacity="0.5" />
      <rect x="38" y="39" width="1" height="1" fill="currentColor" opacity="0.5" />
      {/* Handle (stair-step diagonal) */}
      <rect x="46" y="44" width="2" height="1" fill="currentColor" opacity="0.85" />
      <rect x="47" y="45" width="2" height="1" fill="currentColor" opacity="0.85" />
      <rect x="48" y="46" width="2" height="1" fill="currentColor" opacity="0.85" />
      <rect x="49" y="47" width="2" height="1" fill="currentColor" opacity="0.85" />
      <rect x="50" y="48" width="2" height="1" fill="currentColor" opacity="0.85" />

      {/* Bottom shelf right side: a few thin books standing up. */}
      <BookSpine x={62} y={36} w={4} h={11} className="text-cyan-500" />
      <BookSpine x={67} y={38} w={4} h={9} className="text-violet-500" />
      <BookSpine x={72} y={36} w={4} h={11} className="text-orange-500" />
      <BookSpine x={77} y={37} w={4} h={10} className="text-emerald-500" />
      <BookSpine x={82} y={36} w={4} h={11} className="text-red-500" />
      <BookSpine x={87} y={38} w={3} h={9} className="text-blue-500" />
    </svg>
  );
}

interface BookSpineProps {
  x: number;
  y: number;
  w: number;
  h: number;
  className: string;
}

// Book spine helper. Draws the colored body plus a darker top cap and
// the suggestion of a horizontal title band so it reads as a book at
// pixel scale, not a flat block.
function BookSpine({ x, y, w, h, className }: BookSpineProps) {
  return (
    <g className={className}>
      <rect x={x} y={y} width={w} height={h} fill="currentColor" />
      {/* Darker top cap */}
      <rect x={x} y={y} width={w} height={1} fill="currentColor" opacity="0.6" />
      {/* Title band roughly a third down the spine */}
      <rect
        x={x + 1}
        y={y + Math.floor(h / 3)}
        width={w - 2}
        height={1}
        fill="currentColor"
        opacity="0.55"
      />
    </g>
  );
}
