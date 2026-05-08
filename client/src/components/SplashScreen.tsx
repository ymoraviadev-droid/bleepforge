import { useEffect, useState } from "react";
import { CreditLine } from "./Footer";

interface Props {
  onDone: () => void;
  durationMs?: number;
}

// Boot-line flavor — one cycles through during the splash, advancing every
// ~700ms. With the default 2s splash that lands ~3 lines per session, just
// enough to feel like a real boot sequence without becoming noisy. Add to
// this list freely; the cycle survives any length.
const BOOT_LINES = [
  "POLISHING BLEEPS...",
  "CALIBRATING SCAVENGERS...",
  "WINDING THE GROVE...",
  "AWAKENING HAP-500s...",
  "LOADING KARMA TABLES...",
  "PINNING NOTICES...",
  "TUNING TERMINALS...",
  "DEFRAGGING DIALOG TREES...",
  "REINFORCING THE RFF...",
  "ENERGIZING CIRCUITS...",
  "SEALING BUNKER DOORS...",
  "WIRING UP ROBOTS...",
  "TIDYING THE WORKSHOP...",
  "FORGING BLEEPS...",
  "GREASING SLD-300 JOINTS...",
];

// Pixel-themed splash that fires on initial mount of the app. The bar fills
// 0 → 100% over `durationMs` (default 2s), then `onDone` is called and the
// host hides the splash. Eventually replaced by Tauri's native splash; the
// React version stays as a fallback for non-Tauri (web/dev) sessions.
export function SplashScreen({ onDone, durationMs = 2000 }: Props) {
  const [progress, setProgress] = useState(0);
  // Random starting index so back-to-back reloads don't always show the same
  // boot line first; cycle through the list in order from there.
  const [bootLineIdx, setBootLineIdx] = useState(() =>
    Math.floor(Math.random() * BOOT_LINES.length),
  );

  useEffect(() => {
    const start = performance.now();
    let cancelled = false;
    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
      if (elapsed >= durationMs) {
        onDone();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [durationMs, onDone]);

  useEffect(() => {
    const id = setInterval(() => {
      setBootLineIdx((i) => (i + 1) % BOOT_LINES.length);
    }, 700);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950">
      <div className="font-display text-3xl tracking-wider text-emerald-400">
        BLEEPFORGE
      </div>
      <div className="mt-2 font-mono text-xs text-neutral-500">
        Flock of Bleeps · planning tool
      </div>

      <div className="mt-10 w-72 border-2 border-neutral-700 bg-neutral-900 p-1">
        <div
          className="h-3 bg-emerald-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 font-mono text-[10px] tabular-nums text-neutral-500">
        {Math.round(progress)}%
      </div>
      <div className="mt-3 font-mono text-[11px] tracking-wider text-emerald-400/70">
        {BOOT_LINES[bootLineIdx]}
      </div>

      {/* Credit pinned to the bottom — same content as the app footer so
          the attribution greets you on both ends of the session. */}
      <div className="absolute right-0 bottom-6 left-0">
        <CreditLine />
      </div>
    </div>
  );
}
