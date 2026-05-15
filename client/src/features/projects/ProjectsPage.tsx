import { useEffect, useState } from "react";

import { Button } from "../../components/Button";
import { showChoice, showConfirm, showPrompt } from "../../components/Modal";
import { PixelSkeleton } from "../../components/PixelSkeleton";
import { pushToast } from "../../components/Toast";
import {
  projectsApi,
  type CreateProjectResult,
  type ProjectsList,
} from "../../lib/api";
import { isElectron, restartApp } from "../../lib/electron";
import { NewProjectModal } from "./NewProjectModal";
import { ProjectCard } from "./ProjectCard";
import { emitProjectsChanged } from "./projectsBus";

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

  // Notify the sidebar chip (and any other listener) that project state
  // changed. Refresh first so our local view is up to date, then emit —
  // the chip's listener re-fetches from /api/projects.
  async function refreshAndNotify(): Promise<void> {
    await refresh();
    emitProjectsChanged();
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
        await refreshAndNotify();
      }
    } catch (err) {
      setSwitchingTo(null);
      setError((err as Error).message);
    }
  }

  async function handleRename(slug: string): Promise<void> {
    if (!data) return;
    const project = data.projects.find((p) => p.slug === slug);
    if (!project) return;
    const next = await showPrompt({
      title: "Rename project",
      message: `Slug stays "${slug}" — only the display name changes.`,
      defaultValue: project.displayName,
      confirmLabel: "Rename",
      validate: (v) => (v.trim().length === 0 ? "Name cannot be empty" : null),
    });
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed === project.displayName) return;
    try {
      await projectsApi.rename(slug, trimmed);
      await refreshAndNotify();
      pushToast({
        id: `projects:renamed:${slug}`,
        title: `Renamed to "${trimmed}"`,
        variant: "success",
      });
    } catch (err) {
      pushToast({
        id: `projects:rename-failed:${slug}`,
        title: "Rename failed",
        body: (err as Error).message,
        variant: "error",
      });
    }
  }

  async function handleRemove(slug: string): Promise<void> {
    if (!data) return;
    const project = data.projects.find((p) => p.slug === slug);
    if (!project) return;
    const sourceGodotNote =
      project.mode === "sync"
        ? " The Godot project itself is never touched, regardless of choice."
        : "";
    const choice = await showChoice({
      title: `Delete "${project.displayName}"?`,
      message: `Forget removes the project from Bleepforge but keeps its files at projects/${slug}/ on disk — you can re-register it later. Delete files also wipes that directory.${sourceGodotNote}`,
      options: [
        { id: "cancel", label: "Cancel", variant: "secondary" },
        { id: "forget", label: "Forget", variant: "secondary" },
        { id: "wipe", label: "Delete files", variant: "danger" },
      ],
    });
    if (!choice || choice === "cancel") return;
    try {
      const result = await projectsApi.remove(slug, choice === "wipe");
      await refreshAndNotify();
      if (result.wipeError) {
        pushToast({
          id: `projects:wipe-partial:${slug}`,
          title: `Forgot "${project.displayName}" — wipe failed`,
          body: result.wipeError,
          variant: "warn",
        });
      } else {
        pushToast({
          id: `projects:removed:${slug}`,
          title: result.wiped
            ? `Deleted "${project.displayName}"`
            : `Forgot "${project.displayName}"`,
          variant: "success",
        });
      }
    } catch (err) {
      pushToast({
        id: `projects:remove-failed:${slug}`,
        title: "Delete failed",
        body: (err as Error).message,
        variant: "error",
      });
    }
  }

  async function handleCreated(result: CreateProjectResult): Promise<void> {
    setShowNewModal(false);
    await refreshAndNotify();
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

  const { projects, activeSlug, runtimeActiveSlug } = data;
  const hasProjects = projects.length > 0;
  const restartQueued =
    activeSlug !== null && activeSlug !== runtimeActiveSlug;
  const queuedProject = restartQueued
    ? projects.find((p) => p.slug === activeSlug)
    : null;
  const runtimeProject = projects.find((p) => p.slug === runtimeActiveSlug);

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

      {restartQueued && !restartPending && (
        <div className="border-2 border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">
          <div className="font-medium text-amber-100">Restart pending</div>
          <p className="mt-1">
            Server is currently serving{" "}
            <span className="font-mono text-amber-100">
              {runtimeProject?.displayName ?? runtimeActiveSlug ?? "(none)"}
            </span>
            ; on-disk pointer is queued for{" "}
            <span className="font-mono text-amber-100">
              {queuedProject?.displayName ?? activeSlug ?? "(none)"}
            </span>
            . Restart Bleepforge so the new project's paths apply — until then
            every page still shows the previous project's data even if the
            switcher claims otherwise.
          </p>
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
              // ACTIVE marker reflects what the running server is
              // serving — not the on-disk pointer. The disk pointer
              // is a queue for the next restart; calling THAT "active"
              // would lie to the user about what data they're seeing.
              active={p.slug === runtimeActiveSlug}
              queued={p.slug === activeSlug && p.slug !== runtimeActiveSlug}
              onSwitch={handleSwitch}
              onRename={handleRename}
              onRemove={handleRemove}
              // Server refuses both anyway, but disabling the menu item
              // when delete is impossible keeps the affordance honest.
              // Gate on the on-disk pointer — that's what DELETE
              // refuses to remove.
              canRemove={p.slug !== activeSlug && projects.length > 1}
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
