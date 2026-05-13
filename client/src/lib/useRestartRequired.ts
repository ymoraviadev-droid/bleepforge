import { useEffect, useMemo, useState } from "react";

import { godotProjectApi, type GodotProjectInfo } from "./api";
import { useGodotProjectRoot } from "../styles/GlobalTheme";

// Returns true when the running server's boot-captured config differs from
// what's currently saved in preferences — i.e. the user has staged a change
// that won't take effect until restart. Today the only such field is the
// Godot project root; future per-domain folder overrides will compose in by
// OR-ing additional delta checks here.
//
// The Preferences page does the same Godot-root comparison inline to drive
// its amber "Restart server to apply" notice. This hook lifts that check so
// the Sidebar's restart icon can mirror the same state — the icon becomes
// the at-a-glance signal anywhere in the app, not just on the Preferences
// page.
export function useRestartRequired(): boolean {
  const { saved } = useGodotProjectRoot();
  const [info, setInfo] = useState<GodotProjectInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    godotProjectApi
      .get()
      .then((r) => {
        if (!cancelled) setInfo(r);
      })
      .catch(() => {
        // Endpoint failure is non-fatal — the icon just stays neutral.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (!info) return false;
    const savedNorm = saved.trim().replace(/\/+$/, "");
    const effectiveNorm = (info.effective ?? "").replace(/\/+$/, "");
    return savedNorm !== "" && savedNorm !== effectiveNorm;
  }, [info, saved]);
}
