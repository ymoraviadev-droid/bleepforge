import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { projectsApi } from "../../lib/api";
import { modeBadgeClass } from "./format";
import { onProjectsChanged } from "./projectsBus";

// Always-visible project chip in the sidebar. Shows the **runtime**
// active project (= what the server is currently serving from) with
// its mode badge; click → /projects.
//
// If the on-disk active pointer disagrees with the runtime (the user
// created or switched a project but the server hasn't been restarted
// yet to pick up the change), surface an amber pulse + tooltip so the
// user knows the chip and the data they're seeing match — but a
// pending change exists on disk.
//
// Refetches on the Bleepforge:projects-changed window event so create
// / switch / rename / delete all reflect immediately. The active
// project still can't change in-session without a restart — the bus
// covers state changes that happen IN this session.

interface ChipState {
  /** What the server is currently serving. */
  displayName: string;
  mode: "sync" | "notebook";
  active: true;
  /** When true, the on-disk pointer disagrees with the runtime —
   *  restart pending. */
  pending: boolean;
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
    async function load(): Promise<void> {
      try {
        const d = await projectsApi.list();
        if (cancelled) return;
        // Display the RUNTIME project — that's what the user is seeing
        // in every other view. The on-disk pointer's just a hint about
        // what's queued for the next boot.
        const runtime = d.projects.find((p) => p.slug === d.runtimeActiveSlug);
        if (runtime) {
          setState({
            displayName: runtime.displayName,
            mode: runtime.mode,
            active: true,
            pending: d.activeSlug !== d.runtimeActiveSlug,
          });
        } else {
          setState({ active: false });
        }
      } catch {
        if (!cancelled) setState({ active: false });
      }
    }
    void load();
    const unsub = onProjectsChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsub();
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
      title={
        state.pending
          ? `${state.displayName} (${state.mode}) — restart pending to apply queued project switch`
          : `${state.displayName} (${state.mode}) — open projects page`
      }
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {state.pending && (
          <span
            aria-label="Restart pending"
            className="restart-pending-glow inline-block size-2 shrink-0 bg-amber-400"
          />
        )}
        <span className="truncate text-xs font-medium">{state.displayName}</span>
      </span>
      <span
        className={`shrink-0 border px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider ${modeBadgeClass(state.mode)}`}
      >
        {state.mode}
      </span>
    </Link>
  );
}
