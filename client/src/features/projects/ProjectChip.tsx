import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { projectsApi } from "../../lib/api";
import { modeBadgeClass } from "./format";

// Always-visible project chip in the sidebar. Shows the active
// project's display name + mode badge, click → /projects.
//
// One fetch on mount; the active project doesn't change during a
// session (switching requires a server restart) so polling and SSE
// would be wasted. Highlights when /projects is the current route.

interface ChipState {
  displayName: string;
  mode: "sync" | "notebook";
  active: true;
}

interface ChipEmpty {
  active: false;
}

export function ProjectChip() {
  const [state, setState] = useState<ChipState | ChipEmpty | null>(null);
  const location = useLocation();
  const onProjectsRoute = location.pathname === "/projects";

  useEffect(() => {
    let cancelled = false;
    projectsApi
      .list()
      .then((d) => {
        if (cancelled) return;
        const active = d.projects.find((p) => p.slug === d.activeSlug);
        if (active) {
          setState({
            displayName: active.displayName,
            mode: active.mode,
            active: true,
          });
        } else {
          setState({ active: false });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ active: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null) {
    // Skeleton — single line at the same height as the resolved chip so
    // the sidebar's vertical rhythm doesn't shift when the fetch lands.
    return (
      <div className="border-y-2 border-neutral-800 px-3 py-1.5">
        <div className="h-4 w-2/3 animate-pulse bg-neutral-800/60" />
      </div>
    );
  }

  const base =
    "flex w-full items-center justify-between gap-2 px-3 py-1.5 transition-colors";
  const stateClass = onProjectsRoute
    ? "bg-emerald-950/30 text-emerald-200"
    : "text-neutral-300 hover:bg-neutral-900";

  if (!state.active) {
    return (
      <Link
        to="/projects"
        className={`border-y-2 border-neutral-800 ${base} ${stateClass}`}
        title="No active project — open projects page"
      >
        <span className="truncate text-xs italic text-neutral-500">
          No active project
        </span>
        <span className="shrink-0 font-mono text-[10px] text-neutral-600">
          ›
        </span>
      </Link>
    );
  }

  return (
    <Link
      to="/projects"
      className={`border-y-2 border-neutral-800 ${base} ${stateClass}`}
      title={`${state.displayName} (${state.mode}) — open projects page`}
    >
      <span className="truncate text-xs font-medium">{state.displayName}</span>
      <span
        className={`shrink-0 border px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider ${modeBadgeClass(state.mode)}`}
      >
        {state.mode}
      </span>
    </Link>
  );
}
