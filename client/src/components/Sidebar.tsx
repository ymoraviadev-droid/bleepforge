import { NavLink } from "react-router";

import { AppSearch } from "./AppSearch";
import { showConfirm } from "./Modal";
import { RestartIcon } from "./RestartIcon";
import { DiagnosticsIcon } from "../features/diagnostics/DiagnosticsIcon";
import { useDiagnostics } from "../features/diagnostics/useDiagnostics";
import { GearIcon } from "../features/preferences/GearIcon";
import { HelpIcon } from "../features/help/HelpIcon";
import { isElectron, popoutOrNavigate, restartApp } from "../lib/electron";

// Single chrome column on the left edge. Holds (top-to-bottom):
//   1. BLEEPFORGE branding + version
//   2. Four meta-action icons in one horizontal row
//      (Diagnostics / Preferences / Help / Restart)
//   3. AppSearch input
//   4. The 11 domain nav links (vertical stack)
//
// Replaced the v0.2.1 Phase 3 sidebar+topbar split when the sidebar
// proved underused at w-56: stacking the meta chrome inside it gives
// the user a single scan column for everything that isn't the page
// content, frees the top of the main area entirely, and keeps the
// search palette / icons accessible without giving them their own
// strip across the top.
//
// Width is fixed at w-64 (256px). Per-domain pixel icons next to the
// nav labels are still a Phase 3.5 follow-up. Hidden in popout
// windows — those are focused subviews and ship without app chrome.

const NAV_BASE =
  "flex items-center border-l-4 px-4 py-2 text-sm font-medium transition-colors";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${NAV_BASE} ${
    isActive
      ? "border-l-emerald-500 bg-emerald-950/40 text-emerald-200"
      : "border-l-transparent text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

// Square icon-button. Shared by all four meta actions in the icons row.
const ICON_BASE =
  "relative flex items-center justify-center border-2 p-1.5 transition-colors";

const prefsClass = ({ isActive }: { isActive: boolean }) =>
  `${ICON_BASE} ${
    isActive
      ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
      : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

function diagnosticsTitle(
  severity: "loading" | "clean" | "warning" | "error",
  count: number,
): string {
  if (severity === "error")
    return `Diagnostics: ${count} issue${count === 1 ? "" : "s"}`;
  if (severity === "warning")
    return `Diagnostics: ${count} warning${count === 1 ? "" : "s"}`;
  if (severity === "clean") return "Diagnostics — all clear";
  return "Diagnostics";
}

// Severity-aware variant for the Diagnostics icon. Stroke color shifts
// with state so the user sees urgency before reading the badge count.
const diagClass = (
  severity: "loading" | "clean" | "warning" | "error",
) =>
  ({ isActive }: { isActive: boolean }) => {
    if (severity === "error") {
      return `${ICON_BASE} ${
        isActive
          ? "border-red-600 bg-red-950/40 text-red-300"
          : "border-transparent text-red-400 hover:border-red-700 hover:bg-red-950/30 hover:text-red-300"
      }`;
    }
    if (severity === "warning") {
      return `${ICON_BASE} ${
        isActive
          ? "border-amber-600 bg-amber-950/40 text-amber-300"
          : "border-transparent text-amber-400 hover:border-amber-700 hover:bg-amber-950/30 hover:text-amber-300"
      }`;
    }
    return prefsClass({ isActive });
  };

async function handleRestart(): Promise<void> {
  const ok = await showConfirm({
    title: "Restart Bleepforge?",
    message:
      "Any unsaved edits in open forms will be lost. Use this after changing the Godot project root in Preferences, or to pick up other boot-captured config.",
    confirmLabel: "Restart",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (!ok) return;
  await restartApp();
}

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
  const diagnostics = useDiagnostics();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r-2 border-neutral-800 bg-neutral-950">
      {/* Branding: app name + build version. Both static; version is
          baked at build time via Vite's __APP_VERSION__ define so a
          single bump in electron/package.json propagates here. */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div
          className="font-display text-base tracking-wider text-emerald-400 select-none"
          aria-label="Bleepforge"
        >
          BLEEPFORGE
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-neutral-500">
          v{__APP_VERSION__}
        </div>
      </div>

      {/* Meta-action icons — single horizontal row inside the sidebar.
          Same four icons + same severity-aware tinting the old top bar
          had, just stacked above search + nav instead of beside them. */}
      <div className="shrink-0 border-y-2 border-neutral-800 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <NavLink
            to="/diagnostics"
            onClick={(e) => popoutOrNavigate(e, "/diagnostics")}
            className={diagClass(diagnostics.overall)}
            title={diagnosticsTitle(diagnostics.overall, diagnostics.totalCount)}
            aria-label={diagnosticsTitle(diagnostics.overall, diagnostics.totalCount)}
          >
            <DiagnosticsIcon size={20} />
            {diagnostics.totalCount > 0 && (
              <span
                className={`absolute -right-1 -top-1 flex min-w-3.5 items-center justify-center border border-neutral-950 px-0.5 font-mono text-[9px] font-semibold leading-none text-white ${
                  diagnostics.overall === "error" ? "bg-red-600" : "bg-amber-600"
                }`}
              >
                {diagnostics.totalCount > 99 ? "99+" : diagnostics.totalCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/preferences"
            onClick={(e) => popoutOrNavigate(e, "/preferences")}
            className={prefsClass}
            title="Preferences"
            aria-label="Preferences"
          >
            <GearIcon size={20} />
          </NavLink>
          <NavLink
            to="/help"
            onClick={(e) => popoutOrNavigate(e, "/help")}
            className={prefsClass}
            title="Help"
            aria-label="Help"
          >
            <HelpIcon size={20} />
          </NavLink>
          {isElectron() && (
            <button
              type="button"
              onClick={handleRestart}
              className={prefsClass({ isActive: false })}
              title="Restart Bleepforge"
              aria-label="Restart Bleepforge"
            >
              <RestartIcon size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar. AppSearch's dropdown anchors to its left edge and
          grows rightward — when the sidebar is the left column the
          dropdown overlays the main content cleanly. */}
      <div className="shrink-0 border-b-2 border-neutral-800 px-3 py-2">
        <AppSearch />
      </div>

      {/* Domain nav. Scrolls inside the column if the window's short
          enough to force overflow — 11 rows × ~36px easily fits even
          at the minimum 600px window height the AppImage enforces. */}
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
