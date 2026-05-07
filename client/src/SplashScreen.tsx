import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
  durationMs?: number;
}

// Pixel-themed splash that fires on initial mount of the app. The bar fills
// 0 → 100% over `durationMs` (default 2s), then `onDone` is called and the
// host hides the splash. Eventually replaced by Tauri's native splash; the
// React version stays as a fallback for non-Tauri (web/dev) sessions.
export function SplashScreen({ onDone, durationMs = 2000 }: Props) {
  const [progress, setProgress] = useState(0);

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
    </div>
  );
}
