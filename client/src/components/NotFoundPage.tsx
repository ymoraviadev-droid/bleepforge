// 404 page — caught by App.tsx's catch-all `*` route. Pixel-themed: big
// "404" in the display font, a lost-signal robot below, a couple of links
// to the most useful pages so the user always has somewhere to land.

import type { ReactElement } from "react";
import { ButtonLink } from "./Button";

export function NotFoundPage(): ReactElement {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="font-display text-5xl tracking-widest text-neutral-700">
        404
      </div>
      <div className="text-neutral-500">
        <LostSignal className="size-32" />
      </div>
      <div className="space-y-1">
        <h1 className="font-display text-base uppercase tracking-wider text-neutral-300">
          No signal at this address
        </h1>
        <p className="text-xs text-neutral-500">
          The page you tried to reach doesn't exist in this build.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <ButtonLink to="/concept" size="sm">
          Go home
        </ButtonLink>
        <ButtonLink to="/dialogs" size="sm" variant="secondary">
          Open dialog graph
        </ButtonLink>
        <ButtonLink to="/diagnostics" size="sm" variant="ghost">
          Diagnostics
        </ButtonLink>
      </div>
    </div>
  );
}

interface IllustrationProps {
  className?: string;
  title?: string;
}

// 24x24 — robot face, antenna up, looking for a signal that isn't there.
// Wide hollow eyes (looking around), broken-arc waves above antenna with
// open ends instead of closed loops, a stray "?" floating to one side.
// Distinct from BrokenRobot — that one is *broken*, this one is *confused*.
export function LostSignal({
  className = "",
  title = "Lost signal",
}: IllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Signal arcs above antenna — broken / open-ended */}
      {/* Inner arc */}
      <rect x="10" y="2" width="1" height="1" fill="currentColor" opacity="0.5" />
      <rect x="13" y="2" width="1" height="1" fill="currentColor" opacity="0.5" />
      {/* Mid arc (broken — only the sides) */}
      <rect x="8" y="1" width="1" height="1" fill="currentColor" opacity="0.4" />
      <rect x="15" y="1" width="1" height="1" fill="currentColor" opacity="0.4" />
      {/* Floating "?" mark to the right (compressed at 3x4) */}
      <rect x="18" y="2" width="2" height="1" fill="currentColor" opacity="0.85" />
      <rect x="20" y="3" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="19" y="4" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="19" y="6" width="1" height="1" fill="currentColor" opacity="0.95" />
      {/* Antenna (intact) */}
      <rect x="11" y="3" width="2" height="1" fill="currentColor" opacity="0.7" />
      <rect x="11" y="4" width="2" height="2" fill="currentColor" opacity="0.6" />
      {/* Head body */}
      <rect x="4" y="6" width="16" height="14" fill="currentColor" opacity="0.18" />
      <rect x="4" y="6" width="16" height="1" fill="currentColor" opacity="0.65" />
      <rect x="4" y="19" width="16" height="1" fill="currentColor" opacity="0.65" />
      <rect x="4" y="6" width="1" height="14" fill="currentColor" opacity="0.65" />
      <rect x="19" y="6" width="1" height="14" fill="currentColor" opacity="0.65" />
      {/* Eyes — wide hollow O-O (3x3 with hollow center) */}
      {/* Left eye */}
      <rect x="6" y="10" width="3" height="1" fill="currentColor" opacity="0.9" />
      <rect x="6" y="12" width="3" height="1" fill="currentColor" opacity="0.9" />
      <rect x="6" y="10" width="1" height="3" fill="currentColor" opacity="0.9" />
      <rect x="8" y="10" width="1" height="3" fill="currentColor" opacity="0.9" />
      {/* Right eye */}
      <rect x="15" y="10" width="3" height="1" fill="currentColor" opacity="0.9" />
      <rect x="15" y="12" width="3" height="1" fill="currentColor" opacity="0.9" />
      <rect x="15" y="10" width="1" height="3" fill="currentColor" opacity="0.9" />
      <rect x="17" y="10" width="1" height="3" fill="currentColor" opacity="0.9" />
      {/* Mouth — small open "o" (slight surprise) */}
      <rect x="11" y="16" width="2" height="1" fill="currentColor" opacity="0.7" />
      <rect x="11" y="17" width="2" height="1" fill="currentColor" opacity="0.7" />
      {/* Cheek bolts */}
      <rect x="4" y="13" width="1" height="1" fill="currentColor" opacity="0.8" />
      <rect x="19" y="13" width="1" height="1" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
