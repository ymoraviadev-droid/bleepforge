import { useEffect, useState } from "react";
import { reconcileApi, type ReconcileStatus } from "../../lib/api";
import { formatLongDateTime } from "../../lib/date";

// Boot-reconcile diagnostic tab. Same content as the previous /reconcile page
// minus the page chrome (header lives in HealthPage). Read-only — rebuilding
// requires a server restart by design (config is captured once at boot).

export function ReconcileTab() {
  const [status, setStatus] = useState<ReconcileStatus | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    reconcileApi
      .getStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === undefined && error === null) {
    return <div className="text-neutral-500">Loading…</div>;
  }

  if (error) {
    return <p className="text-red-400">Failed to fetch: {error}</p>;
  }

  if (status === null) {
    return (
      <p className="text-neutral-400">
        The server hasn't completed its boot-time reconcile yet. Refresh in a
        moment.
      </p>
    );
  }

  const s = status as ReconcileStatus;
  const totalErrors = s.errorDetails.length;
  const totalSkipped = s.skippedDetails.length;
  const totalImported = Object.values(s.perDomain).reduce(
    (n, c) => n + c.imported,
    0,
  );
  const ranAt = formatLongDateTime(s.ranAt);

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Last boot-time rebuild of the JSON cache from{" "}
        <span className="font-mono">.tres</span>. Ran {ranAt} in {s.durationMs}
        ms. Restart the server to re-run.
      </p>

      {!s.ok && (
        <div className="border-2 border-red-700 bg-red-950/30 p-3 text-sm text-red-200">
          <div className="font-semibold">Reconcile aborted</div>
          <p className="mt-1 text-xs">{s.error ?? "Unknown error"}</p>
          <p className="mt-1 text-xs text-red-300">
            The JSON cache wasn't updated. Whatever's on disk is what the UI is
            reading.
          </p>
        </div>
      )}

      <Summary
        imported={totalImported}
        skipped={totalSkipped}
        errors={totalErrors}
      />

      <section className="space-y-2">
        <h3 className="font-display text-xs tracking-wider text-emerald-400">
          PER DOMAIN
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.entries(s.perDomain) as [string, typeof s.perDomain.items][]).map(
            ([name, c]) => {
              const dirty = c.skipped > 0 || c.errors > 0;
              return (
                <div
                  key={name}
                  className={`border-2 p-2 text-xs ${
                    dirty
                      ? "border-amber-700 bg-amber-950/20"
                      : "border-neutral-800 bg-neutral-950/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono uppercase tracking-wider text-neutral-200">
                      {name}
                    </span>
                    <span className="font-mono text-emerald-300">
                      {c.imported}
                    </span>
                  </div>
                  {(c.skipped > 0 || c.errors > 0) && (
                    <div className="mt-1 flex gap-3 text-[10px]">
                      {c.skipped > 0 && (
                        <span className="text-amber-400">
                          {c.skipped} skipped
                        </span>
                      )}
                      {c.errors > 0 && (
                        <span className="text-red-400">{c.errors} errors</span>
                      )}
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
      </section>

      {s.errorDetails.length > 0 && (
        <DetailList
          title="Errors"
          tone="red"
          items={s.errorDetails.map((e) => ({
            domain: e.domain,
            file: e.file,
            note: e.error,
          }))}
        />
      )}

      {s.skippedDetails.length > 0 && (
        <DetailList
          title="Skipped"
          tone="amber"
          items={s.skippedDetails.map((sk) => ({
            domain: sk.domain,
            file: sk.file,
            note: sk.reason,
          }))}
        />
      )}

      {totalErrors === 0 && totalSkipped === 0 && s.ok && (
        <p className="text-xs text-neutral-500">
          All <span className="font-mono">.tres</span> files imported cleanly.
        </p>
      )}
    </div>
  );
}

function Summary({
  imported,
  skipped,
  errors,
}: {
  imported: number;
  skipped: number;
  errors: number;
}) {
  return (
    <div className="flex gap-4 text-sm">
      <span className="text-emerald-300">
        <span className="font-mono">{imported}</span> imported
      </span>
      {skipped > 0 && (
        <span className="text-amber-400">
          <span className="font-mono">{skipped}</span> skipped
        </span>
      )}
      {errors > 0 && (
        <span className="text-red-400">
          <span className="font-mono">{errors}</span> errors
        </span>
      )}
    </div>
  );
}

function DetailList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "red" | "amber";
  items: { domain: string; file: string; note: string }[];
}) {
  const titleClass = tone === "red" ? "text-red-400" : "text-amber-400";
  return (
    <section className="space-y-2">
      <h3 className={`font-display text-xs tracking-wider ${titleClass}`}>
        {title.toUpperCase()} ({items.length})
      </h3>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="border-2 border-neutral-800 bg-neutral-950/40 p-2 text-xs"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono uppercase tracking-wider text-neutral-500">
                {it.domain}
              </span>
              <span className="font-mono text-neutral-300">{it.file}</span>
            </div>
            <p className={`mt-1 ${tone === "red" ? "text-red-300" : "text-amber-300"}`}>
              {it.note}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
