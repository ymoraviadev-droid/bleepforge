import { useEffect, useState } from "react";
import { Link } from "react-router";

// Pixel-themed toast system. Mirrors the Modal pattern: a module-level
// singleton state with a pub/sub bus, plus a single <ToastHost /> rendered
// once at the App root that reads the state and re-renders on changes.
//
// Toasts can carry an optional `to` route — clicking the body navigates and
// dismisses. The corner × dismisses without navigating. Hovering the toast
// pauses the auto-close timer so you can read it without it disappearing.
//
// Dedupe: pass an `id` to replace an existing toast with the same id (used by
// the sync-toast bridge so rapid re-saves of the same entity collapse into a
// single entry that resets its timer).

export type ToastVariant = "info" | "success" | "warn" | "error";

export interface ToastOptions {
  title: string;
  body?: string;
  to?: string;
  variant?: ToastVariant;
  durationMs?: number;
  id?: string;
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  to?: string;
  variant: ToastVariant;
  durationMs: number;
  // Wall-clock time when this toast should auto-dismiss. Pushed forward on
  // every animation frame the user is hovering — that's how we "pause" it.
  expiresAt: number;
}

const DEFAULT_DURATION_MS = 5000;
const MAX_VISIBLE = 5;

let toasts: Toast[] = [];
const subs = new Set<() => void>();
let nextAutoId = 1;

function notify() {
  for (const fn of subs) fn();
}

export function pushToast(opts: ToastOptions): string {
  const id = opts.id ?? `t${nextAutoId++}`;
  const variant: ToastVariant = opts.variant ?? "info";
  const durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
  const next: Toast = {
    id,
    title: opts.title,
    body: opts.body,
    to: opts.to,
    variant,
    durationMs,
    expiresAt: Date.now() + durationMs,
  };

  // Replace by id if it already exists; otherwise append.
  const existingIdx = toasts.findIndex((t) => t.id === id);
  if (existingIdx >= 0) {
    toasts = [
      ...toasts.slice(0, existingIdx),
      next,
      ...toasts.slice(existingIdx + 1),
    ];
  } else {
    toasts = [...toasts, next];
    // Cap visible count — drop the oldest beyond MAX_VISIBLE.
    if (toasts.length > MAX_VISIBLE) {
      toasts = toasts.slice(toasts.length - MAX_VISIBLE);
    }
  }
  notify();
  return id;
}

export function dismissToast(id: string): void {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) notify();
}

export function clearToasts(): void {
  if (toasts.length === 0) return;
  toasts = [];
  notify();
}

export function ToastHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

const ACCENT: Record<
  ToastVariant,
  { border: string; bar: string; icon: string }
> = {
  info: {
    border: "border-emerald-700",
    bar: "bg-emerald-500",
    icon: "text-emerald-400",
  },
  success: {
    border: "border-emerald-700",
    bar: "bg-emerald-500",
    icon: "text-emerald-400",
  },
  warn: {
    border: "border-amber-700",
    bar: "bg-amber-500",
    icon: "text-amber-400",
  },
  error: {
    border: "border-red-700",
    bar: "bg-red-500",
    icon: "text-red-400",
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const [hover, setHover] = useState(false);
  // Forces a periodic re-render while the timer is running so the progress
  // bar smoothly animates. We don't recompute timing on each tick — we just
  // re-read `expiresAt`, which the bus already updated when the toast was
  // (re-)pushed.
  const [, force] = useState(0);

  // Auto-dismiss timer + ticker for the progress bar. Pauses on hover by
  // pushing expiresAt forward each frame the user is still over the toast.
  useEffect(() => {
    let raf = 0;
    let lastTick = Date.now();
    const tick = () => {
      const now = Date.now();
      if (hover) {
        // Re-extend so the timer "pauses" for the duration of the hover.
        toast.expiresAt += now - lastTick;
      }
      lastTick = now;
      if (now >= toast.expiresAt) {
        dismissToast(toast.id);
        return;
      }
      force((x) => x + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hover, toast]);

  const accent = ACCENT[toast.variant];
  const remaining = Math.max(0, toast.expiresAt - Date.now());
  const progress = Math.max(0, Math.min(1, remaining / toast.durationMs));

  const onClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dismissToast(toast.id);
  };

  const inner = (
    <>
      <div className="flex items-start gap-2 px-3 py-2">
        <SaveIcon className={`mt-0.5 size-3.5 shrink-0 ${accent.icon}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-neutral-100">
            {toast.title}
          </div>
          {toast.body && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-neutral-400">
              {toast.body}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 px-1 text-xs text-neutral-500 transition-colors hover:text-neutral-200"
        >
          ×
        </button>
      </div>
      <div className="h-1 w-full bg-neutral-800/60">
        <div
          className={`h-full ${accent.bar} transition-[width] duration-100 ease-linear`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </>
  );

  const shellClass = `toast-bounce-in pointer-events-auto block w-80 cursor-pointer overflow-hidden border-2 ${accent.border} bg-neutral-900 text-left transition-colors hover:bg-neutral-800/60 focus:outline-none focus:ring-2 focus:ring-emerald-500`;
  const shellStyle = { boxShadow: "4px 4px 0 0 rgba(0,0,0,0.6)" };
  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    role: "status" as const,
  };

  if (toast.to) {
    return (
      <Link
        to={toast.to}
        onClick={() => dismissToast(toast.id)}
        className={shellClass}
        style={shellStyle}
        {...handlers}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={shellClass.replace("cursor-pointer", "cursor-default")} style={shellStyle} {...handlers}>
      {inner}
    </div>
  );
}

// Pixel-art save / floppy-ish glyph. Same crispEdges treatment as the
// diagnostics + view toggle icons so the toasts feel native to the rest of
// the UI rather than borrowed from Material/etc.
function SaveIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="1" width="10" height="10" fillOpacity="0" stroke="currentColor" strokeWidth="1" />
      <rect x="3" y="2" width="6" height="3" />
      <rect x="7" y="2" width="1" height="3" fillOpacity="0" stroke="currentColor" />
      <rect x="3" y="7" width="6" height="3" />
    </svg>
  );
}
