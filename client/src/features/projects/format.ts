// Shared formatting helpers for the projects surface.

/** Format an ISO timestamp as a short "2 minutes ago" string. Mirrors
 *  the convention used by the Saves feed + Workbench activity strip;
 *  inlined here to avoid plumbing a third caller through the existing
 *  formatTime() helper which sits inside the saves module. */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return seconds <= 1 ? "just now" : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  // Fall back to a date string past 30 days — "X months ago" is
  // imprecise enough that a calendar reading is more useful.
  return new Date(iso).toLocaleDateString();
}

/** Color for the per-project mode badge. Emerald for sync (the live
 *  Godot-coupled mode); slate for notebook (the standalone mode that
 *  ships in phase 5). Kept as a function so we can extend the badge
 *  vocabulary later (import-once, etc.). */
export function modeBadgeClass(mode: "sync" | "notebook"): string {
  if (mode === "sync") {
    return "border-emerald-700/60 bg-emerald-950/40 text-emerald-300";
  }
  return "border-slate-700/60 bg-slate-950/40 text-slate-300";
}
