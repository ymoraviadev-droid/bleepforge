import { useEffect, useMemo, useRef, useState } from "react";
import { CreditLine } from "./Footer";
import { useBootProgress, type BootProgress } from "../lib/boot/progress";
import { revealMainWindow } from "../lib/electron";

interface Props {
  onDone: () => void;
}

// Boot-line flavor pool. Three are picked at splash start — one paired
// with each boot phase — so the splash reads as a sequence ("polishing →
// calibrating → loading") rather than a random ticker. Add freely; the
// pool just needs ≥ 3 entries.
const BOOT_LINES = [
  "POLISHING BLEEPS",
  "CALIBRATING SCAVENGERS",
  "WINDING THE GROVE",
  "AWAKENING HAP-500s",
  "LOADING KARMA TABLES",
  "PINNING NOTICES",
  "TUNING TERMINALS",
  "DEFRAGGING DIALOG TREES",
  "REINFORCING THE RFF",
  "ENERGIZING CIRCUITS",
  "SEALING BUNKER DOORS",
  "WIRING UP ROBOTS",
  "TIDYING THE WORKSHOP",
  "FORGING BLEEPS",
  "GREASING SLD-300 JOINTS",
];

// Ready-state messages, shown alongside CONTINUE once every checkpoint
// has fired. One is picked per splash mount; sticks until CONTINUE is
// clicked so the user always sees a clear "done" cue even on fast
// hardware where the per-phase flavor lines fly by too quick to read.
const READY_LINES = [
  "ALL SYSTEMS ONLINE",
  "ALL DATABASES LOADED",
  "BLEEPFORGE STANDING BY",
  "READY TO FORGE",
  "AWAITING INPUT",
];

const FADE_OUT_MS = 220;

// Pixel-themed splash that fires on initial mount of the app. Centered
// card on a full-window dark overlay; the overlay hides the app shell
// hydrating underneath so the user never sees a partially-painted UI
// flicker through. The progress bar is real, driven by useBootProgress
// against three checkpoints (server / preferences / catalog). When all
// three report, the cycling boot line is replaced by a CONTINUE button
// (Enter/Space dismiss too). On click → fade-out → onDone.
export function SplashScreen({ onDone }: Props) {
  const progress = useBootProgress();
  const [dismissing, setDismissing] = useState(false);

  // Pick one flavor line per checkpoint + one ready-state line, all
  // randomized at mount so back-to-back launches don't always show the
  // same sequence. useRef so the picks survive re-renders.
  const phaseFlavorRef = useRef<string[]>([]);
  const readyLineRef = useRef<string>("");
  if (phaseFlavorRef.current.length === 0) {
    const shuffled = [...BOOT_LINES].sort(() => Math.random() - 0.5);
    phaseFlavorRef.current = shuffled.slice(0, 3);
    readyLineRef.current = READY_LINES[Math.floor(Math.random() * READY_LINES.length)]!;
  }

  // What text occupies the status line below the progress bar?
  //   - During loading: the flavor for the currently-completing phase
  //     (index = completed.length, capped). The progress bar shows the
  //     actual percent so the text is purely vibes.
  //   - On timeout (still loading): a "server slow to respond" notice.
  //   - When ready: a "READY" message that sticks until CONTINUE is
  //     clicked — sits right above the button so the user always sees
  //     a clear "done" cue, even on fast machines where the per-phase
  //     flavor lines fly by too quick to read.
  const statusLine = useMemo(() => {
    if (progress.timedOut && !progress.ready) {
      return "SERVER SLOW TO RESPOND";
    }
    if (progress.ready) return readyLineRef.current;
    const idx = Math.min(progress.completed.length, 2);
    return `${phaseFlavorRef.current[idx]}…`;
  }, [progress.completed.length, progress.ready, progress.timedOut]);

  function dismiss(): void {
    if (dismissing) return;
    setDismissing(true);
    // In Electron the main window started splash-sized; kick off the
    // maximize in parallel with the fade so the window grows as the
    // splash fades out. Browser mode no-ops — the splash there is just
    // a full-window overlay over the React app.
    void revealMainWindow();
    // Match the CSS transition duration so the overlay is fully gone by
    // the time onDone unmounts us. The app shell is already painted under
    // the overlay, so when this resolves the user sees a smooth wipe to
    // the home page (no flicker, no flash).
    setTimeout(onDone, FADE_OUT_MS);
  }

  // Enter / Space dismiss once ready (or once timed out, so a hung boot
  // still has a keyboard escape).
  useEffect(() => {
    if (!progress.ready && !progress.timedOut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.ready, progress.timedOut]);

  const canDismiss = progress.ready || progress.timedOut;
  const buttonLabel = progress.ready ? "CONTINUE" : "CONTINUE ANYWAY";

  return (
    // 2px inset (not inset-0) so the body's emerald outline — the same
    // window-edge accent every other Bleepforge window uses (Preferences
    // / Diagnostics / Help / main window post-splash) — stays visible
    // around the splash. A flat inset-0 overlay would paint over it and
    // hide the edge entirely during boot.
    <div
      className={`fixed inset-[2px] z-50 flex items-center justify-center bg-neutral-950 transition-opacity duration-200 ${
        dismissing ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Centered content block — no border of its own. The window's
          own emerald edge (body outline in index.css) frames the splash,
          and since the OS window is now sized to match the splash, that
          edge sits right where the card border used to be. Width still
          capped so the progress bar (w-full) doesn't stretch edge-to-
          edge. */}
      <div
        className={`flex w-[min(80vw,520px)] flex-col items-center px-10 py-12 transition-transform duration-200 ${
          dismissing ? "scale-95" : "scale-100"
        }`}
        role="dialog"
        aria-label="Loading Bleepforge"
      >
        <div className="font-display text-3xl tracking-wider text-emerald-400">
          BLEEPFORGE
        </div>
        <div className="mt-2 font-mono text-xs text-neutral-500">
          Flock of Bleeps · planning tool
        </div>

        <div className="mt-10 w-full border-2 border-neutral-700 bg-neutral-900 p-1">
          <div
            className="h-3 bg-emerald-500 transition-[width] duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="mt-2 font-mono text-[10px] tabular-nums text-neutral-500">
          {progress.percent}%
        </div>

        {/* Status text is always visible — flavor during loading,
            timeout notice on stuck server, READY message when done.
            CONTINUE button slides in below when dismissible. The fixed
            min-height keeps the card from jumping when the button slot
            fills in. */}
        <div className="mt-4 flex min-h-16 flex-col items-center gap-3">
          <div className="font-mono text-[11px] tracking-wider text-emerald-400/80">
            {statusLine}
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={dismiss}
              autoFocus
              className="splash-continue-glow border-2 border-emerald-600 bg-emerald-950/40 px-5 py-2 font-display text-xs tracking-wider text-emerald-300 transition-colors hover:bg-emerald-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>

      {/* Credit pinned to the bottom of the overlay (not the card) — same
          content as the app footer so the attribution greets you on both
          ends of the session. */}
      <div className="absolute right-0 bottom-6 left-0">
        <CreditLine />
      </div>
    </div>
  );
}

// Re-export so the App can render the progress hook elsewhere if needed.
export type { BootProgress };
