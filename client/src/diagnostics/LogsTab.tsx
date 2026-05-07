import { useEffect, useMemo, useState } from "react";
import { logsApi, type LogEntry } from "../api";
import { Button } from "../Button";
import { showConfirm } from "../Modal";

// Server-log viewer. Reads from the in-memory ring buffer at /api/logs.
// v1 is fetch-on-demand (manual refresh button + a fresh fetch every time
// the user opens the tab) — no SSE streaming yet. New errors that happen
// after the page loaded won't update the header icon until the user
// reloads the app, but the Logs tab itself can refresh in place.
//
// Filter is the user's "default-to-bad-when-bad-exists" idea: when the tab
// opens and there are errors in the buffer, the filter starts on "bad" so
// the user lands on the relevant entries instead of having to scroll.

type Filter = "all" | "good" | "bad";

export function LogsTab() {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const list = await logsApi.list();
      setEntries(list);
      // First-load filter pick: if there are errors/warnings present, default
      // to "bad" so the user sees them on landing. Once the user has
      // explicitly picked a filter we leave it alone (filter !== null).
      setFilter((prev) => {
        if (prev !== null) return prev;
        const hasBad = list.some(
          (l) => l.level === "error" || l.level === "warning",
        );
        return hasBad ? "bad" : "all";
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const clear = async () => {
    const ok = await showConfirm({
      title: "Clear all log entries?",
      message:
        "Wipes the in-memory log buffer. New console output keeps being captured normally — this just gives you a clean slate before reproducing a bug.",
      confirmLabel: "Clear",
      danger: true,
    });
    if (!ok) return;
    try {
      await logsApi.clear();
      setEntries([]);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    if (!entries) return [];
    const matchesFilter = (e: LogEntry) => {
      if (filter === "all" || filter === null) return true;
      if (filter === "good") return e.level === "info";
      return e.level === "warning" || e.level === "error";
    };
    // Newest first — reverse the buffer order.
    return entries.filter(matchesFilter).slice().reverse();
  }, [entries, filter]);

  const counts = useMemo(() => {
    if (!entries) return { all: 0, good: 0, bad: 0 };
    let good = 0;
    let bad = 0;
    for (const e of entries) {
      if (e.level === "info") good++;
      else bad++;
    }
    return { all: entries.length, good, bad };
  }, [entries]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          Last {entries?.length ?? 0} server log lines (rolls past 1000).
          Captured from <span className="font-mono">console.*</span>.
        </p>
        <div className="flex items-center gap-2">
          <FilterChips
            value={filter ?? "all"}
            onChange={setFilter}
            counts={counts}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? "…" : "Refresh"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void clear()}
            disabled={!entries || entries.length === 0}
            title="Wipe the in-memory log buffer"
          >
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-2 border-red-700 bg-red-950/30 p-3 text-xs text-red-200">
          Failed to fetch logs: {error}
        </div>
      )}

      {entries !== null && visible.length === 0 && !error && (
        <p className="text-xs italic text-neutral-500">
          No log entries match the current filter.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="divide-y divide-neutral-800 border-2 border-neutral-800 font-mono text-[11px]">
          {visible.map((e, i) => (
            <Row key={`${e.ts}-${i}`} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChips({
  value,
  onChange,
  counts,
}: {
  value: Filter;
  onChange: (f: Filter) => void;
  counts: { all: number; good: number; bad: number };
}) {
  return (
    <div className="flex gap-1 text-[10px]">
      <Chip active={value === "all"} onClick={() => onChange("all")}>
        All <span className="text-neutral-500">{counts.all}</span>
      </Chip>
      <Chip
        active={value === "good"}
        onClick={() => onChange("good")}
        tone="emerald"
      >
        Good <span className="text-neutral-500">{counts.good}</span>
      </Chip>
      <Chip active={value === "bad"} onClick={() => onChange("bad")} tone="red">
        Bad <span className="text-neutral-500">{counts.bad}</span>
      </Chip>
    </div>
  );
}

function Chip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "emerald" | "red";
  children: React.ReactNode;
}) {
  let activeClass = "border-emerald-600 bg-emerald-950/40 text-emerald-200";
  if (tone === "red") activeClass = "border-red-700 bg-red-950/40 text-red-200";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-2 px-2 py-1 font-mono uppercase tracking-wider transition-colors ${
        active
          ? activeClass
          : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString();
  const levelClass =
    entry.level === "error"
      ? "text-red-300"
      : entry.level === "warning"
        ? "text-amber-300"
        : "text-neutral-400";
  const levelLabel =
    entry.level === "warning" ? "WARN" : entry.level.toUpperCase();
  const rowBg =
    entry.level === "error"
      ? "bg-red-950/20"
      : entry.level === "warning"
        ? "bg-amber-950/10"
        : "";
  return (
    <li className={`flex gap-2 px-2 py-1 ${rowBg}`}>
      <span className="shrink-0 text-neutral-600">{time}</span>
      <span className={`shrink-0 ${levelClass}`}>{levelLabel.padEnd(5)}</span>
      <span className="whitespace-pre-wrap wrap-break-word text-neutral-200">
        {entry.message}
      </span>
    </li>
  );
}

