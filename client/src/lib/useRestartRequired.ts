import { useEffect, useState } from "react";

import { projectsApi } from "./api";
import { onProjectsChanged } from "../features/projects/projectsBus";

// Returns true when the running server's state disagrees with what the
// next boot would load. Two sources of disagreement:
//
//   1. Active-project switch pending: `activeSlug` (disk pointer)
//      differs from `runtimeActiveSlug` (in-process config). Happens
//      after a create / switch / import-once action.
//
//   2. Godot-root change pending (added when test-project validation
//      surfaced the bug): `runtimeGodotProjectRoot` (in-process
//      config) differs from the registry's stored
//      `project.godotProjectRoot` for the runtime active project.
//      Happens after a Preferences save that edited the path.
//
// Pre-v0.2.5 hotfix the hook compared `preferences.godotProjectRoot`
// to `/api/godot-project.effective`, which was the only restart-pending
// signal back when there was a single project. Post-v0.2.5 the
// canonical "what's active" lives in active-project.json + the project
// registry; this hook compares both axes of that state against the
// in-process runtime values.
//
// Subscribes to the projects bus so create / switch / rename / delete /
// preferences save re-trigger the check immediately. Without that, the
// icon could lag on a stale fetch and surprise the user. The hot-reload
// path (POST /api/projects/reload) is what NORMALLY clears the pending
// state — this hook is the fallback signal when that hasn't run yet.

export function useRestartRequired(): boolean {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const d = await projectsApi.list();
        if (cancelled) return;
        const activeChange =
          d.activeSlug !== null && d.activeSlug !== d.runtimeActiveSlug;
        // Godot-root delta: find the runtime-active project in the
        // registry and compare its stored path against the runtime
        // value. Normalize trailing slashes so /foo and /foo/ don't
        // false-positive. Null === null is fine.
        const runtimeProject = d.projects.find(
          (p) => p.slug === d.runtimeActiveSlug,
        );
        const stored = (runtimeProject?.godotProjectRoot ?? null);
        const running = d.runtimeGodotProjectRoot ?? null;
        const norm = (v: string | null) =>
          v === null ? null : v.replace(/\/+$/, "");
        const godotRootChange = norm(stored) !== norm(running);
        setPending(activeChange || godotRootChange);
      } catch {
        // Endpoint failure is non-fatal — the icon just stays neutral.
      }
    }
    void check();
    const unsub = onProjectsChanged(() => {
      void check();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return pending;
}
