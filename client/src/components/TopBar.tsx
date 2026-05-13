import { NavLink } from "react-router";

import { AppSearch } from "./AppSearch";
import { showConfirm } from "./Modal";
import { RestartIcon } from "./RestartIcon";
import { DiagnosticsIcon } from "../features/diagnostics/DiagnosticsIcon";
import { useDiagnostics } from "../features/diagnostics/useDiagnostics";
import { GearIcon } from "../features/preferences/GearIcon";
import { HelpIcon } from "../features/help/HelpIcon";
import { isElectron, popoutOrNavigate, restartApp } from "../lib/electron";

// Thin top bar above the main content area. Carries the app-wide
// search (left) and the four meta-action icons (right): Diagnostics,
// Preferences, Help, Restart. Replaces the right-half of the old
// horizontal header strip; the left-half (BLEEPFORGE + domain nav)
// moved into the Sidebar.
//
// All five of these are "about the app, not the project content," so
// they cluster on a single chrome surface separate from the domain
// nav. Search left-aligned (primary action of the bar, falls under
// the first-read position); meta icons right-aligned in the order
// they appeared in the old header.
//
// Hidden in popout windows — those are focused subviews and ship
// without app chrome.

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

// Severity-aware variant for the Diagnostics icon — same shape as the
// old header version. Stroke color shifts with state (red error,
// amber warning, neutral otherwise) so the user sees urgency before
// reading the badge count.
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

export function TopBar() {
  const diagnostics = useDiagnostics();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b-2 border-neutral-800 bg-neutral-950 px-4">
      <div className="min-w-0 flex-1">
        <AppSearch />
      </div>
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
    </header>
  );
}
