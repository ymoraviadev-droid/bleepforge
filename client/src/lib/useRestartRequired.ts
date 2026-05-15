import { useEffect, useState } from "react";

import { projectsApi } from "./api";
import { onProjectsChanged } from "../features/projects/projectsBus";

// Returns true when the on-disk active-project pointer disagrees with
// what the running server has captured in-process — i.e. some action
// (create / switch / import-once) wrote a new active pointer but the
// server hasn't picked it up yet.
//
// Pre-v0.2.5 hotfix the hook compared `preferences.godotProjectRoot`
// to `/api/godot-project.effective`, which was the only restart-pending
// signal back when there was a single project. After v0.2.5 the
// canonical "what's active" lives in active-project.json (disk) +
// `config.activeProjectSlug` (runtime); the godot-root delta is just a
// derivative — and it was producing false negatives (notebook
// projects where godot root never changes) and false positives (godot
// root captured stale even after a manual restart).
//
// Subscribes to the projects bus so create / switch / rename / delete
// re-trigger the check immediately. Without that, the icon could lag
// on a stale fetch and surprise the user. The hot-reload path
// (POST /api/projects/reload) is what NORMALLY clears the pending
// state — this hook is the fallback signal when that hasn't run yet.

export function useRestartRequired(): boolean {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const d = await projectsApi.list();
        if (cancelled) return;
        setPending(
          d.activeSlug !== null && d.activeSlug !== d.runtimeActiveSlug,
        );
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
