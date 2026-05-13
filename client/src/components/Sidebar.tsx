import { NavLink } from "react-router";

// Vertical nav rail on the left edge of the app shell. Replaces the
// horizontal header strip that used to carry these 11 links. The
// sidebar is text-only in v0.2.1 Phase 3 — per-domain pixel icons are
// a Phase 3.5 follow-up (we want to live with the layout for a few
// days before committing icon shapes).
//
// Width is fixed at 220px; not collapsible in v1. Active item shows an
// emerald left-edge accent bar (4px) + bg-tinted row + text-tinted
// label. Inactive items keep a transparent 4px left border so labels
// don't jump horizontally on selection. Hidden in popout windows —
// those are focused subviews and ship without app chrome.
//
// Order intentionally mirrors the prior horizontal nav so the user's
// muscle memory transfers: Concept first (homepage), Factions through
// Balloons grouped as game-content, Items / Shaders / Codex / Assets
// as the trailing catch-all surfaces.

const NAV_BASE =
  "flex items-center border-l-4 px-4 py-2 text-sm font-medium transition-colors";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${NAV_BASE} ${
    isActive
      ? "border-l-emerald-500 bg-emerald-950/40 text-emerald-200"
      : "border-l-transparent text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

interface NavEntry {
  to: string;
  label: string;
}

const NAV_ITEMS: NavEntry[] = [
  { to: "/concept", label: "Game concept" },
  { to: "/factions", label: "Factions" },
  { to: "/npcs", label: "NPCs" },
  { to: "/quests", label: "Quests" },
  { to: "/karma", label: "Karma" },
  { to: "/dialogs", label: "Dialogs" },
  { to: "/balloons", label: "Balloons" },
  { to: "/items", label: "Items" },
  { to: "/shaders", label: "Shaders" },
  { to: "/codex", label: "Game codex" },
  { to: "/assets", label: "Assets" },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r-2 border-neutral-800 bg-neutral-950">
      <div className="flex h-14 shrink-0 items-center border-b-2 border-neutral-800 px-4">
        <span
          className="font-display text-sm tracking-wider text-emerald-400 select-none"
          aria-label="Bleepforge"
        >
          BLEEPFORGE
        </span>
      </div>
      <nav className="flex flex-1 flex-col overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
