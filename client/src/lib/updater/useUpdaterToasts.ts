import { useEffect } from "react";

import { pushToast } from "../../components/Toast";
import { installUpdate, subscribeUpdaterStatus } from "../electron";

// Bridge auto-update events from the Electron main process into the
// renderer's toast surface. Mounted once at App root (in every window —
// the toast bus is per-window, and each window's user wants to see the
// update prompt from whichever surface they're focusing).
//
// UX flow (Phase 2):
//   - update-available  → brief info toast: "Update vX.Y.Z available — downloading…"
//                         Auto-dismisses after ~6s (the download takes longer
//                         than that; the toast is just an ambient cue).
//   - update-downloaded → sticky cyan toast: "vX.Y.Z ready to install — click
//                         to restart" with onClick → installUpdate()
//                         (which calls quitAndInstall on the main side).
//   - error             → silent. Logged in <userData>/boot.log; surfacing
//                         every check-failed event would be noise.
//   - checking / not-available / download-progress → silent. The toast
//                         system shouldn't fire on every routine check.
//
// Dedupe id "updater-status" replaces the in-flight "available" toast with
// the "downloaded" toast when the download finishes — they're the same
// conversation from the user's perspective.
const TOAST_ID = "updater-status";

export function useUpdaterToasts(): void {
  useEffect(() => {
    return subscribeUpdaterStatus((status) => {
      if (status.kind === "available") {
        pushToast({
          id: TOAST_ID,
          title: `Update v${status.version} available`,
          body: "Downloading in the background…",
          variant: "info",
          durationMs: 6_000,
        });
        return;
      }
      if (status.kind === "downloaded") {
        pushToast({
          id: TOAST_ID,
          title: `v${status.version} ready to install`,
          body: "Click to restart and apply",
          variant: "saved",
          persistent: true,
          onClick: () => {
            void installUpdate();
          },
        });
        return;
      }
      // checking / not-available / download-progress / error → silent.
    });
  }, []);
}
