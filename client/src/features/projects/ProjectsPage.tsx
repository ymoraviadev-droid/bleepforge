import { useEffect, useState } from "react";

import { Button } from "../../components/Button";
import { showConfirm } from "../../components/Modal";
import { PixelSkeleton } from "../../components/PixelSkeleton";
import {
  projectsApi,
  type CreateProjectResult,
  type ProjectsList,
} from "../../lib/api";
import { isElectron, restartApp } from "../../lib/electron";
import { NewProjectModal } from "./NewProjectModal";
import { ProjectCard } from "./ProjectCard";

// /projects — the multi-project management surface. Lists every
// registered project with the active one marked; clicking a non-active
// card swaps active + restarts the app.
//
// Phase 4 scope is read + switch only. New/rename/delete/close land in
// later phases when they have UI flows that justify them. Today the
// Flock of Bleeps project is the sole entry post-migration, so the
// page is mostly informational + sets up the infra for phase 5.

export function ProjectsPage() {
  const [data, setData] = useState<ProjectsList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [restartPending, setRestartPending] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  async function refresh(): Promise<void> {
    try {
      const d = await projectsApi.list();
      setData(d);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleSwitch(slug: string): Promise<void> {
    if (!data) return;
    const target = data.projects.find((p) => p.slug === slug);
    if (!target) return;
    const electronMode = isElectron();
    const ok = await showConfirm({
      title: `Switch to "${target.displayName}"?`,
      message: electronMode
        ? `Bleepforge will restart so the new project's data, content, and (if applicable) Godot root are picked up. Any unsaved edits in open forms will be lost.`
        : `The active project will switch on the next server boot. Restart your dev server manually to apply, and any unsaved edits will be lost.`,
      confirmLabel: electronMode ? "Switch and restart" : "Switch",
      cancelLabel: "Cancel",
      danger: false,
    });
    if (!ok) return;
    setSwitchingTo(slug);
    try {
      const result = await projectsApi.setActive(slug);
      if (result.noop) {
        // Already the active project — nothing to do, but the prior list
        // refresh below stays useful in case lastSwitched moved.
        setSwitchingTo(null);
        return;
      }
      if (electronMode) {
        await restartApp();
        // restartApp triggers app.relaunch + app.exit; control doesn't
        // return here in practice. Belt + braces: clear the busy state
        // so if the restart somehow doesn't fire we recover.
        setSwitchingTo(null);
      } else {
        // Browser-dev mode: server restart is the user's problem. The
        // pointer on disk has flipped but the running server's captured
        // paths still point at the previous project. Surface an inline
        // banner instead of pretending the switch is live.
        setRestartPending(target.displayName);
        setSwitchingTo(null);
        await refresh();
      }
    } catch (err) {
      setSwitchingTo(null);
      setError((err as Error).message);
    }
  }

  async function handleCreated(result: CreateProjectResult): Promise<void> {
    setShowNewModal(false);
    await refresh();
    if (!result.restartRequired) return;
    const electronMode = isElectron();
    const ok = await showConfirm({
      title: `Created "${result.project.displayName}"`,
      message: electronMode
        ? `It's now the active project. Restart Bleepforge to load it?`
        : `It's now the active project on disk. Restart your dev server (\`pnpm dev\`) to load it.`,
      confirmLabel: electronMode ? "Restart now" : "OK",
      cancelLabel: electronMode ? "Later" : "Cancel",
      danger: false,
    });
    if (!ok) return;
    if (electronMode) {
      await restartApp();
    } else {
      setRestartPending(result.project.displayName);
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-lg tracking-wider">Projects</h1>
        <p className="border-2 border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
          Failed to load projects: {error}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-lg tracking-wider">Projects</h1>
        <PixelSkeleton />
      </div>
    );
  }

  const { projects, activeSlug } = data;
  const hasProjects = projects.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-lg tracking-wider">Projects</h1>
          <p className="text-xs text-neutral-500">
            One Bleepforge install can hold many projects. Switching restarts
            the app so the new project's paths apply cleanly.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowNewModal(true)}
        >
          + New project
        </Button>
      </div>

      {restartPending && (
        <div className="border-2 border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">
          Switched the active project to{" "}
          <span className="font-mono text-amber-100">{restartPending}</span>{" "}
          on disk. The running server still has the previous project's paths
          captured — restart your dev server (`pnpm dev`) to pick up the
          change.
        </div>
      )}

      {!hasProjects && (
        <div className="border-2 border-neutral-800 bg-neutral-950 p-4">
          <div className="font-display text-sm tracking-wider text-neutral-200">
            No projects yet
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            The "New project" flow ships in v0.2.6 phase 5 — until then you
            can scaffold a project by setting{" "}
            <code className="text-neutral-200">GODOT_PROJECT_ROOT</code> and
            restarting; the legacy migration will register a sync project
            against that tree.
          </p>
        </div>
      )}

      {hasProjects && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.slug}
              project={p}
              active={p.slug === activeSlug}
              onSwitch={handleSwitch}
              busy={switchingTo === p.slug}
            />
          ))}
        </div>
      )}

      <div className="border-t-2 border-neutral-800 pt-3 font-mono text-[10px] text-neutral-500">
        Bleepforge root:{" "}
        <span className="text-neutral-300">{data.bleepforgeRoot}</span>
      </div>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
