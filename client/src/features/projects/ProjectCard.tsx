import type { Project } from "@bleepforge/shared";

import { Button } from "../../components/Button";
import { formatRelative, modeBadgeClass } from "./format";

interface ProjectCardProps {
  project: Project;
  active: boolean;
  onSwitch?: (slug: string) => void;
  busy?: boolean;
}

// One project card in the /projects grid. Active project gets an
// emerald accent border + "ACTIVE" badge; non-active cards show a
// Switch button that fires onSwitch when clicked.
//
// Density matches the rest of the list-page card pattern (NpcCard /
// ItemCard / QuestCard) — bordered panel, title row at top, metadata
// rows below, action row at the bottom. Visual identity for projects
// over domain entities is mostly the active-state treatment plus the
// per-mode badge.
export function ProjectCard({ project, active, onSwitch, busy }: ProjectCardProps) {
  return (
    <div
      className={`card-lift flex flex-col gap-2 border-2 p-3 ${
        active
          ? "border-emerald-600/70 bg-emerald-950/20"
          : "border-neutral-800 bg-neutral-950"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm tracking-wider text-neutral-100">
            {project.displayName}
          </div>
          <div className="truncate font-mono text-[10px] text-neutral-500">
            {project.slug}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${modeBadgeClass(project.mode)}`}
            title={
              project.mode === "sync"
                ? "Two-way sync with a Godot project's .tres files"
                : "Standalone — Bleepforge owns the data, no Godot connection"
            }
          >
            {project.mode}
          </span>
          {active && (
            <span className="border border-emerald-600/60 bg-emerald-950/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
              active
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        {project.mode === "sync" && (
          <>
            <dt className="text-neutral-500">Godot root</dt>
            <dd className="truncate font-mono text-neutral-300">
              {project.godotProjectRoot ?? (
                <span className="text-amber-400">(not set)</span>
              )}
            </dd>
          </>
        )}
        <dt className="text-neutral-500">Last opened</dt>
        <dd className="text-neutral-300">{formatRelative(project.lastOpened)}</dd>
        <dt className="text-neutral-500">Created</dt>
        <dd className="text-neutral-300">{formatRelative(project.createdAt)}</dd>
      </dl>

      {!active && onSwitch && (
        <div className="pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onSwitch(project.slug)}
            disabled={busy}
            className="w-full"
          >
            {busy ? "Switching…" : "Switch to this project"}
          </Button>
        </div>
      )}
    </div>
  );
}
