// Pixel-art empty states for list pages. Same single-fill, opacity-for-shape,
// crispEdges aesthetic as PixelPlaceholder.tsx. Each illustration uses
// currentColor so the parent's text color tints it — usage sites set the
// color (typically text-neutral-600 for a muted "atmospheric" feel).

import type { ReactElement, ReactNode } from "react";
import { Button, ButtonLink } from "./Button";

interface EmptyStateProps {
  /** Pixel-art illustration. Pass one of the variants below at e.g. size-32. */
  illustration?: ReactElement;
  title: string;
  body?: ReactNode;
  /** Primary CTA — typically "+ Create first X" linking to /domain/new. */
  action?: { label: string; href?: string; onClick?: () => void };
}

export function EmptyState({
  illustration,
  title,
  body,
  action,
}: EmptyStateProps): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      {illustration && (
        <div className="text-neutral-600">{illustration}</div>
      )}
      <h3 className="font-display text-xs uppercase tracking-wider text-neutral-300">
        {title}
      </h3>
      {body && (
        <div className="max-w-sm text-xs leading-relaxed text-neutral-500">
          {body}
        </div>
      )}
      {action &&
        (action.href ? (
          <ButtonLink to={action.href} size="sm">
            {action.label}
          </ButtonLink>
        ) : (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}

interface IllustrationProps {
  className?: string;
  title?: string;
}

// 48x32 — empty workshop. Wall pegboard with bare hooks above a long bench
// with one empty toolbox; nothing on the bench, nothing on the hooks. Reads
// as "this is where things would be made — but the shelves are bare."
// Used for: items, factions.
export function WorkshopEmpty({
  className = "",
  title = "Empty workshop",
}: IllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 48 32"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Back wall band */}
      <rect x="0" y="0" width="48" height="14" fill="currentColor" opacity="0.06" />
      {/* Pegboard frame */}
      <rect x="6" y="2" width="36" height="12" fill="currentColor" opacity="0.1" />
      <rect x="6" y="2" width="36" height="1" fill="currentColor" opacity="0.45" />
      <rect x="6" y="13" width="36" height="1" fill="currentColor" opacity="0.45" />
      <rect x="6" y="2" width="1" height="12" fill="currentColor" opacity="0.45" />
      <rect x="41" y="2" width="1" height="12" fill="currentColor" opacity="0.45" />
      {/* Pegboard hole grid */}
      {[5, 8, 11].map((y) =>
        [10, 14, 18, 22, 26, 30, 34, 38].map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="1"
            height="1"
            fill="currentColor"
            opacity="0.3"
          />
        ))
      )}
      {/* 3 empty hooks (small Cs) */}
      <rect x="13" y="6" width="2" height="1" fill="currentColor" opacity="0.7" />
      <rect x="13" y="7" width="1" height="2" fill="currentColor" opacity="0.7" />
      <rect x="25" y="6" width="2" height="1" fill="currentColor" opacity="0.7" />
      <rect x="25" y="7" width="1" height="2" fill="currentColor" opacity="0.7" />
      <rect x="35" y="6" width="2" height="1" fill="currentColor" opacity="0.7" />
      <rect x="35" y="7" width="1" height="2" fill="currentColor" opacity="0.7" />
      {/* Workbench surface (long horizontal slab) */}
      <rect x="2" y="20" width="44" height="2" fill="currentColor" opacity="0.6" />
      <rect x="2" y="22" width="44" height="1" fill="currentColor" opacity="0.4" />
      {/* Bench legs */}
      <rect x="4" y="22" width="2" height="6" fill="currentColor" opacity="0.5" />
      <rect x="42" y="22" width="2" height="6" fill="currentColor" opacity="0.5" />
      {/* One empty toolbox on the bench */}
      <rect x="20" y="16" width="9" height="4" fill="currentColor" opacity="0.5" />
      <rect x="20" y="16" width="9" height="1" fill="currentColor" opacity="0.75" />
      <rect x="23" y="14" width="3" height="2" fill="currentColor" opacity="0.55" />
      <rect x="24" y="13" width="1" height="1" fill="currentColor" opacity="0.6" />
      {/* Floor line */}
      <rect x="0" y="29" width="48" height="1" fill="currentColor" opacity="0.4" />
      {/* Floor speckle */}
      <rect x="11" y="30" width="1" height="1" fill="currentColor" opacity="0.5" />
      <rect x="32" y="30" width="1" height="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

// 48x32 — empty noticeboard. Cork board with a few stray pushpins and one
// torn-paper scrap left behind. Reads as "no postings yet."
// Used for: quests.
export function NoticeboardEmpty({
  className = "",
  title = "Empty noticeboard",
}: IllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 48 32"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Wood frame outer */}
      <rect x="2" y="3" width="44" height="26" fill="currentColor" opacity="0.5" />
      {/* Cork field inner */}
      <rect x="4" y="5" width="40" height="22" fill="currentColor" opacity="0.12" />
      {/* Cork speckle */}
      {[
        [7, 8], [12, 11], [18, 7], [23, 13], [29, 9], [34, 14], [39, 8],
        [9, 17], [16, 20], [25, 18], [32, 22], [38, 19], [11, 23], [21, 24],
        [28, 25], [35, 24], [41, 12], [42, 22], [6, 13],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="1"
          height="1"
          fill="currentColor"
          opacity="0.28"
        />
      ))}
      {/* Pushpins (3) */}
      <rect x="14" y="9" width="2" height="2" fill="currentColor" opacity="0.85" />
      <rect x="30" y="11" width="2" height="2" fill="currentColor" opacity="0.85" />
      <rect x="22" y="20" width="2" height="2" fill="currentColor" opacity="0.85" />
      {/* Torn paper scrap (top-right corner only — the rest of the note is gone) */}
      <rect x="36" y="6" width="6" height="3" fill="currentColor" opacity="0.7" />
      <rect x="36" y="9" width="5" height="1" fill="currentColor" opacity="0.55" />
      <rect x="36" y="10" width="3" height="1" fill="currentColor" opacity="0.4" />
      <rect x="36" y="11" width="2" height="1" fill="currentColor" opacity="0.3" />
      {/* Pin holding the scrap */}
      <rect x="38" y="6" width="2" height="2" fill="currentColor" opacity="0.95" />
      {/* Frame highlight (top + left) */}
      <rect x="2" y="3" width="44" height="1" fill="currentColor" opacity="0.7" />
      <rect x="2" y="3" width="1" height="26" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

// 48x32 — silent terminal. CRT monitor with a steady cursor on an otherwise
// blank screen. Reads as "system online, nothing to display."
// Used for: dialogs (list view), balloons.
export function TerminalSilent({
  className = "",
  title = "Silent terminal",
}: IllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 48 32"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Monitor outer frame */}
      <rect x="6" y="3" width="36" height="22" fill="currentColor" opacity="0.5" />
      {/* Screen inner area */}
      <rect x="8" y="5" width="32" height="18" fill="currentColor" opacity="0.16" />
      {/* Scanlines */}
      {[7, 10, 13, 16, 19, 22].map((y) => (
        <rect
          key={y}
          x="8"
          y={y}
          width="32"
          height="1"
          fill="currentColor"
          opacity="0.06"
        />
      ))}
      {/* Blinking-style cursor (just a still block — animation is overkill) */}
      <rect x="11" y="13" width="3" height="2" fill="currentColor" opacity="0.85" />
      {/* Power LED */}
      <rect x="38" y="22" width="2" height="1" fill="currentColor" opacity="0.95" />
      {/* Top ventilation slits */}
      <rect x="14" y="2" width="3" height="1" fill="currentColor" opacity="0.45" />
      <rect x="19" y="2" width="3" height="1" fill="currentColor" opacity="0.45" />
      <rect x="24" y="2" width="3" height="1" fill="currentColor" opacity="0.45" />
      <rect x="29" y="2" width="3" height="1" fill="currentColor" opacity="0.45" />
      {/* Stand neck */}
      <rect x="22" y="25" width="4" height="3" fill="currentColor" opacity="0.6" />
      {/* Stand base */}
      <rect x="16" y="28" width="16" height="2" fill="currentColor" opacity="0.7" />
      <rect x="16" y="30" width="16" height="1" fill="currentColor" opacity="0.5" />
      {/* Frame highlight */}
      <rect x="6" y="3" width="36" height="1" fill="currentColor" opacity="0.75" />
      <rect x="6" y="3" width="1" height="22" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

// 48x32 — empty book. Open notebook with bare lined pages and a small
// bookmark ribbon hanging off the spine. Reads as "this is the project
// notebook — but no entries yet."
// Used for: codex (Game Codex domain).
export function BookEmpty({
  className = "",
  title = "Empty notebook",
}: IllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 48 32"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Surface shadow under the book */}
      <rect x="4" y="28" width="40" height="1" fill="currentColor" opacity="0.18" />
      {/* Left page (back) */}
      <rect x="4" y="6" width="20" height="22" fill="currentColor" opacity="0.5" />
      {/* Right page (back) */}
      <rect x="24" y="6" width="20" height="22" fill="currentColor" opacity="0.5" />
      {/* Page surface — slightly lighter to read as paper */}
      <rect x="5" y="7" width="18" height="20" fill="currentColor" opacity="0.18" />
      <rect x="25" y="7" width="18" height="20" fill="currentColor" opacity="0.18" />
      {/* Spine (darker seam) */}
      <rect x="23" y="6" width="2" height="22" fill="currentColor" opacity="0.7" />
      {/* Page rule lines (faint) */}
      {[10, 13, 16, 19, 22, 25].map((y) => (
        <g key={y}>
          <rect x="6" y={y} width="16" height="1" fill="currentColor" opacity="0.15" />
          <rect x="26" y={y} width="16" height="1" fill="currentColor" opacity="0.15" />
        </g>
      ))}
      {/* Top edge highlight */}
      <rect x="4" y="6" width="40" height="1" fill="currentColor" opacity="0.7" />
      {/* Bookmark ribbon hanging off the spine */}
      <rect x="23" y="4" width="2" height="6" fill="currentColor" opacity="0.85" />
      <rect x="23" y="10" width="1" height="2" fill="currentColor" opacity="0.85" />
      <rect x="24" y="10" width="1" height="2" fill="currentColor" opacity="0.85" />
      {/* Tiny pencil resting on the right page (bottom-right) — reads as
          "ready to write, nothing written yet" */}
      <rect x="35" y="25" width="6" height="1" fill="currentColor" opacity="0.6" />
      <rect x="34" y="25" width="1" height="1" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

// 48x32 — empty bunker. A lone chair under a hanging light, door closed,
// nobody home. Reads as "no robots in this room yet."
// Used for: NPCs, karma impacts.
export function BunkerEmpty({
  className = "",
  title = "Empty bunker",
}: IllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 48 32"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Back wall (lighter) */}
      <rect x="0" y="0" width="48" height="22" fill="currentColor" opacity="0.08" />
      {/* Floor */}
      <rect x="0" y="22" width="48" height="10" fill="currentColor" opacity="0.18" />
      {/* Wall/floor seam */}
      <rect x="0" y="22" width="48" height="1" fill="currentColor" opacity="0.55" />
      {/* Hanging light cord */}
      <rect x="11" y="0" width="1" height="6" fill="currentColor" opacity="0.55" />
      {/* Hanging light fixture */}
      <rect x="9" y="6" width="5" height="2" fill="currentColor" opacity="0.7" />
      <rect x="10" y="8" width="3" height="1" fill="currentColor" opacity="0.85" />
      {/* Light cone (faint) */}
      <rect x="9" y="9" width="5" height="1" fill="currentColor" opacity="0.18" />
      <rect x="8" y="10" width="7" height="1" fill="currentColor" opacity="0.14" />
      <rect x="7" y="11" width="9" height="1" fill="currentColor" opacity="0.1" />
      <rect x="6" y="12" width="11" height="2" fill="currentColor" opacity="0.07" />
      {/* Door (right side, closed) */}
      <rect x="36" y="6" width="9" height="16" fill="currentColor" opacity="0.32" />
      <rect x="36" y="6" width="9" height="1" fill="currentColor" opacity="0.7" />
      <rect x="36" y="6" width="1" height="16" fill="currentColor" opacity="0.6" />
      <rect x="44" y="6" width="1" height="16" fill="currentColor" opacity="0.6" />
      {/* Door handle */}
      <rect x="38" y="14" width="1" height="2" fill="currentColor" opacity="0.85" />
      {/* Lone chair (left of center) */}
      {/* Seat */}
      <rect x="18" y="20" width="6" height="2" fill="currentColor" opacity="0.65" />
      {/* Back */}
      <rect x="22" y="14" width="2" height="6" fill="currentColor" opacity="0.6" />
      {/* Legs */}
      <rect x="18" y="22" width="1" height="4" fill="currentColor" opacity="0.6" />
      <rect x="23" y="22" width="1" height="4" fill="currentColor" opacity="0.6" />
      {/* Floor speckles for texture */}
      <rect x="6" y="27" width="1" height="1" fill="currentColor" opacity="0.4" />
      <rect x="14" y="29" width="1" height="1" fill="currentColor" opacity="0.4" />
      <rect x="30" y="28" width="1" height="1" fill="currentColor" opacity="0.4" />
      <rect x="40" y="29" width="1" height="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
