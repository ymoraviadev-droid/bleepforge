import { useEffect, useState } from "react";
import { watcherApi, type WatcherEvent, type WatcherStatus } from "../../lib/api";

import { PixelSkeleton } from "../../components/PixelSkeleton";
// chokidar status + a recent-events feed. The interesting thing the user
// usually wants to know: "is the watcher firing when I save in Godot?"
// — this tab answers that without forcing them to dig through the Logs
// tab.
//
// Like ProcessTab, this one's informational and doesn't bump the header
// icon. Failed reimports already surface in the Logs tab via
// console.error capture; double-counting them in the diagnostics badge
// would be noise.

export function WatcherTab() {
  const [status, setStatus] = useState<WatcherStatus | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    watcherApi
      .get()
      .then(setStatus)
      .catch((e) => setError(String(e)));
  };

  useEffect(refresh, []);

  if (status === undefined && error === null)
    return <PixelSkeleton />;
  if (error)
    return <p className="text-red-400">Failed to fetch: {error}</p>;
  if (!status)
    return <p className="text-neutral-400">No watcher status available.</p>;

  const failed = status.recentEvents.filter((e) => e.outcome === "failed");

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        chokidar status + the last {status.recentEvents.length} debounced
        events. Reflects whether Godot saves are reaching us cleanly.
      </p>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
        <Row
          label="Active"
          value={
            <span className={status.active ? "text-emerald-400" : "text-red-400"}>
              {status.active ? "yes" : "no"}
            </span>
          }
        />
        <Row label="Root" value={<span className="font-mono">{status.root ?? "(none)"}</span>} />
        <Row
          label="Files"
          value={<span className="font-mono">{status.watchedFileCount}</span>}
        />
        <Row
          label="Events"
          value={
            <span>
              <span className="font-mono">{status.recentEvents.length}</span>
              {failed.length > 0 && (
                <span className="ml-2 text-red-400">
                  ({failed.length} failed)
                </span>
              )}
            </span>
          }
        />
      </dl>

      <div>
        <button
          type="button"
          onClick={refresh}
          className="border-2 border-neutral-800 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
        >
          Refresh
        </button>
      </div>

      {status.recentEvents.length === 0 ? (
        <p className="text-xs italic text-neutral-500">
          No events yet. Save a <span className="font-mono">.tres</span> in
          Godot to see it appear here.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 border-2 border-neutral-800 font-mono text-[11px]">
          {status.recentEvents.map((e, i) => (
            <EventRow key={`${e.ts}-${i}`} ev={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="font-mono uppercase tracking-wider text-neutral-500">
        {label}
      </dt>
      <dd className="text-neutral-200">{value}</dd>
    </>
  );
}

function EventRow({ ev }: { ev: WatcherEvent }) {
  const time = new Date(ev.ts).toLocaleTimeString();
  const outcomeClass =
    ev.outcome === "failed"
      ? "text-red-300"
      : ev.outcome === "reimported"
        ? "text-emerald-300"
        : ev.outcome === "deleted"
          ? "text-amber-300"
          : "text-neutral-500"; // ignored variants
  const rowBg = ev.outcome === "failed" ? "bg-red-950/20" : "";
  // Path shown relative to "godot root + collapse leading dirs" feel: just
  // use basename + the parent dir for context. Full path goes in tooltip.
  const display = shorten(ev.path);
  return (
    <li className={`flex gap-2 px-2 py-1 ${rowBg}`} title={ev.path}>
      <span className="shrink-0 text-neutral-600">{time}</span>
      <span className="w-12 shrink-0 text-neutral-500">{ev.kind}</span>
      <span className={`w-24 shrink-0 ${outcomeClass}`}>{ev.outcome}</span>
      <span className="truncate text-neutral-300">{display}</span>
      {ev.detail && (
        <span className="shrink-0 text-neutral-500">— {ev.detail}</span>
      )}
    </li>
  );
}

function shorten(absPath: string): string {
  // Split on either separator so Windows backslash paths shorten correctly.
  const parts = absPath.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 2) return absPath;
  return ".../" + parts.slice(-2).join("/");
}
