import { useEffect, useState } from "react";
import { processApi, type ProcessInfo } from "../../lib/api";
import { formatLongDateTime } from "../../lib/date";

// Read-only "what is the running server" view. Useful when you suspect the
// process you're talking to isn't the one you expect — common after editing
// preferences and forgetting to restart, or when running multiple checkouts.
//
// Intentionally informational: this tab never bumps the header diagnostics
// icon. If something here is genuinely wrong (e.g. no Godot project root)
// the boot would have failed; this tab's job is "confirm the obvious," not
// "alert on problems."

export function ProcessTab() {
  const [info, setInfo] = useState<ProcessInfo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    processApi
      .get()
      .then(setInfo)
      .catch((e) => setError(String(e)));
  };

  useEffect(refresh, []);

  if (info === undefined && error === null)
    return <div className="text-neutral-500">Loading…</div>;
  if (error)
    return <p className="text-red-400">Failed to fetch: {error}</p>;
  if (!info)
    return <p className="text-neutral-400">No process info available.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        What the running server thinks it is. Refresh to update the uptime.
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
        <Row label="Bleepforge" value={`v${info.bleepforgeVersion}`} mono />
        <Row label="Node" value={info.nodeVersion} mono />
        <Row label="Platform" value={info.platform} mono />
        <Row label="PID" value={String(info.pid)} mono />
        <Row label="Port" value={String(info.port)} mono />
        <Row
          label="Started"
          value={`${formatLongDateTime(info.startedAt)} (uptime ${formatUptime(info.uptimeMs)})`}
        />
        <Row label="Data root" value={info.dataRoot} mono />
        <Row label="Asset root" value={info.assetRoot} mono />
        <Row
          label="Godot root"
          value={
            info.godotProjectRoot
              ? `${info.godotProjectRoot} (from ${info.godotProjectRootSource ?? "?"})`
              : "(none)"
          }
          mono
        />
      </dl>
      <div className="pt-1">
        <button
          type="button"
          onClick={refresh}
          className="border-2 border-neutral-800 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="font-mono uppercase tracking-wider text-neutral-500">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-neutral-200" : "text-neutral-200"}>
        {value}
      </dd>
    </>
  );
}

// Compact uptime: "3m 12s" / "1h 4m" / "2d 5h". Skips zero leading units so
// the common case (seconds-to-minutes during dev) reads clean.
function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
