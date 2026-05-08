import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Balloon, Npc } from "@bleepforge/shared";
import { AssetThumb } from "../../components/AssetThumb";
import { PortraitPlaceholder } from "../../components/PixelPlaceholder";

// Speech-balloon card. Visually mimics an in-game balloon — VT323 mono
// text in a chunky pixel-art frame with a stepped tail pointing down-left.
// Theme-aware via the `--color-emerald-*` accent (re-pointed per theme by
// Theme.tsx); neutral background tracks the canvas tone so the bubble
// reads as floating slightly above the page.
//
// Hover plays the text "typing in" at the balloon's actual `TypeSpeed`,
// matching what the player will see in-game. `TypeSpeed === 0` is the
// game's "show all at once" mode — we skip the animation entirely so the
// preview stays honest about the runtime behavior.

interface BalloonCardProps {
  balloon: Balloon;
  /** NPC robot model directory ("hap_500", "sld_300") — the storage folder
   *  the balloon lives in. Bleepforge id is "<folder>/<balloon.Id>". */
  folder: string;
  /** All NPCs in the catalog. Used to compute a "used by" line via reverse
   *  lookup over `CasualRemarks`. Passed in (rather than pulled from
   *  useCatalog directly) so the parent's filter chain stays the source of
   *  truth and the card stays a pure render. */
  npcs: Npc[];
}

export function BalloonCard({ balloon, folder, npcs }: BalloonCardProps) {
  const ref = `${folder}/${balloon.Id}`;
  const usedBy = npcs.filter((n) => n.CasualRemarks.includes(ref));
  const text = balloon.Text;

  // typedText === null → idle (show full text). Anything else → currently
  // animating; substring of `text` shown so far. We never animate when
  // TypeSpeed is 0 (instant in-game) or when text is empty (nothing to
  // type), so the hover handler short-circuits in those cases.
  const [typedText, setTypedText] = useState<string | null>(null);
  const animating = typedText !== null && typedText !== text;

  const handleMouseEnter = () => {
    if (balloon.TypeSpeed <= 0 || text === "") return;
    setTypedText("");
  };

  const handleMouseLeave = () => {
    setTypedText(null);
  };

  useEffect(() => {
    if (typedText === null || typedText === text) return;
    const intervalMs = 1000 / balloon.TypeSpeed;
    const timer = setTimeout(() => {
      setTypedText(text.slice(0, typedText.length + 1));
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [typedText, text, balloon.TypeSpeed]);

  const displayText = typedText !== null ? typedText : text;

  return (
    <Link
      to={`/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(balloon.Id)}`}
      className="group block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Bubble frame — sharp corners, accent border, theme-aware. The
          speaker portrait sits inside on the left, chat-style; text wraps
          to the right. Reads as "this NPC says this" without needing the
          names list as a separate row below. */}
      <div className="relative">
        <div className="border-2 border-emerald-700 bg-neutral-900 p-3 transition-colors group-hover:border-emerald-500 group-hover:bg-neutral-900/80">
          <div className="flex items-start gap-3">
            {usedBy.length > 0 && (
              <div
                className="flex shrink-0 items-center gap-1"
                title={usedBy.map((n) => n.DisplayName || n.NpcId).join(", ")}
              >
                {usedBy[0]!.Portrait ? (
                  <AssetThumb
                    path={usedBy[0]!.Portrait}
                    size="xs"
                    className="rounded-none!"
                  />
                ) : (
                  <PortraitPlaceholder
                    className="size-8 text-neutral-700"
                    title={`No portrait for ${usedBy[0]!.DisplayName || usedBy[0]!.NpcId}`}
                  />
                )}
                {usedBy.length > 1 && (
                  <span className="font-mono text-[10px] text-neutral-500">
                    +{usedBy.length - 1}
                  </span>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {text ? (
                <p className="line-clamp-4 wrap-break-word font-mono text-sm leading-snug text-neutral-100">
                  {displayText}
                  {animating && (
                    <span
                      aria-hidden
                      className="ml-0.5 inline-block animate-pulse text-emerald-400"
                    >
                      █
                    </span>
                  )}
                </p>
              ) : (
                <p className="font-mono text-sm italic text-neutral-600">
                  (empty)
                </p>
              )}
            </div>
          </div>
        </div>
        {/* Tail — 7-step pixel ladder hanging off the bottom-left in the
            same accent color as the frame. shapeRendering="crispEdges"
            keeps the steps sharp at any UI scale. Bigger and more
            aggressively stepped than a simple triangle. */}
        <svg
          aria-hidden
          viewBox="0 0 14 14"
          width="14"
          height="14"
          className="absolute left-5 top-full block text-emerald-700 transition-colors group-hover:text-emerald-500"
          shapeRendering="crispEdges"
        >
          <rect x="0" y="0" width="14" height="2" fill="currentColor" />
          <rect x="0" y="2" width="12" height="2" fill="currentColor" />
          <rect x="0" y="4" width="10" height="2" fill="currentColor" />
          <rect x="0" y="6" width="8" height="2" fill="currentColor" />
          <rect x="0" y="8" width="6" height="2" fill="currentColor" />
          <rect x="0" y="10" width="4" height="2" fill="currentColor" />
          <rect x="0" y="12" width="2" height="2" fill="currentColor" />
        </svg>
      </div>

      {/* Meta strip — model + timing knobs. Portrait inside the bubble
          already conveys the speaker, so we drop the redundant names row
          and just call out "unused" when nothing references this balloon. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span className="text-emerald-400">{folder}</span>
        <span className="text-neutral-700">·</span>
        <span title="characters per second; 0 = instant (no typing animation)">
          {balloon.TypeSpeed <= 0
            ? "instant"
            : `${fmtNum(balloon.TypeSpeed)} cps`}
        </span>
        <span title="seconds visible after typing finishes">
          {fmtNum(balloon.HoldDuration)}s hold
        </span>
        {usedBy.length === 0 && (
          <>
            <span className="text-neutral-700">·</span>
            <span className="italic text-neutral-600">unused</span>
          </>
        )}
      </div>

      {/* Balloon id — small, faded; useful when text is empty. */}
      <div className="mt-1 truncate font-mono text-[10px] text-neutral-600">
        {balloon.Id}
      </div>
    </Link>
  );
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n);
}
