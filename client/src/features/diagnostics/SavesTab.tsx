import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { savesApi, type SaveEntry } from "../../lib/api";
import { Button } from "../../components/Button";
import { showConfirm } from "../../components/Modal";
import {
  displayKey,
  labelForDomain,
  routeForSave,
} from "../../lib/saves/routes";

// Save activity feed. Two flows in one stream:
//   - "outgoing" (← / Bleepforge → Godot): every PUT that touches a .tres
//   - "incoming" (→ / Godot → Bleepforge): every watcher reimport / delete
//
// Like Watcher and Process, this is informational — it doesn't bump the
// header diagnostics icon. Failed outgoing writes already hit the Logs
// tab via console.* capture, so contributing here would just be
// double-counting (same anti-pattern called out in CLAUDE.md for the
// Watcher tab).
//
// Live updates: SSE on /api/saves/events drives the "Bleepforge:save"
// window event; we prepend each new entry to the visible list so the
// feed updates without a refresh.

type Filter = "all" | "outgoing" | "incoming";

export function SavesTab() {
  const [entries, setEntries] = useState<SaveEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const list = await savesApi.list();
      setEntries(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const clear = async () => {
    const ok = await showConfirm({
      title: "Clear save history?",
      message:
        "Wipes the in-memory save activity buffer. New saves keep being recorded — this just gives you a clean slate.",
      confirmLabel: "Clear",
      danger: true,
    });
    if (!ok) return;
    try {
      await savesApi.clear();
      setEntries([]);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Live updates from SSE — prepend each new entry. The server-side bus
  // already publishes in the same order it records, so newest-first is
  // preserved by sticking each one at the front.
  useEffect(() => {
    const onSave = (e: CustomEvent<SaveEntry>) => {
      setEntries((prev) => (prev ? [e.detail, ...prev] : [e.detail]));
    };
    window.addEventListener("Bleepforge:save", onSave);
    return () => window.removeEventListener("Bleepforge:save", onSave);
  }, []);

  const visible = useMemo(() => {
    if (!entries) return [];
    if (filter === "all") return entries;
    return entries.filter((e) => e.direction === filter);
  }, [entries, filter]);

  const counts = useMemo(() => {
    if (!entries) return { all: 0, outgoing: 0, incoming: 0 };
    let outgoing = 0;
    let incoming = 0;
    for (const e of entries) {
      if (e.direction === "outgoing") outgoing++;
      else incoming++;
    }
    return { all: entries.length, outgoing, incoming };
  }, [entries]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          Last {entries?.length ?? 0} save events (rolls past 500). Both
          directions: Bleepforge → Godot writes and Godot → Bleepforge
          reimports.
        </p>
        <div className="flex items-center gap-2">
          <FilterChips
            value={filter}
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
            title="Wipe the in-memory save activity buffer"
          >
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-2 border-red-700 bg-red-950/30 p-3 text-xs text-red-200">
          Failed to fetch saves: {error}
        </div>
      )}

      {entries !== null && visible.length === 0 && !error && (
        <p className="text-xs italic text-neutral-500">
          {entries.length === 0
            ? "No save activity recorded yet. Edit something in Bleepforge or save a .tres in Godot."
            : "No save events match the current filter."}
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
  counts: { all: number; outgoing: number; incoming: number };
}) {
  return (
    <div className="flex gap-1 text-[10px]">
      <Chip active={value === "all"} onClick={() => onChange("all")}>
        All <span className="text-neutral-500">{counts.all}</span>
      </Chip>
      <Chip
        active={value === "outgoing"}
        onClick={() => onChange("outgoing")}
        tone="emerald"
      >
        ← Out <span className="text-neutral-500">{counts.outgoing}</span>
      </Chip>
      <Chip
        active={value === "incoming"}
        onClick={() => onChange("incoming")}
        tone="amber"
      >
        → In <span className="text-neutral-500">{counts.incoming}</span>
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
  tone?: "emerald" | "amber";
  children: React.ReactNode;
}) {
  let activeClass = "border-emerald-600 bg-emerald-950/40 text-emerald-200";
  if (tone === "amber")
    activeClass = "border-amber-600 bg-amber-950/40 text-amber-200";
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

function Row({ entry }: { entry: SaveEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString();
  const isoTitle = entry.ts;
  const dirLabel = entry.direction === "outgoing" ? "← OUT" : "→ IN";
  const dirClass =
    entry.direction === "outgoing" ? "text-emerald-300" : "text-amber-300";
  const outcomeClass =
    entry.outcome === "error"
      ? "text-red-300"
      : entry.outcome === "warning"
        ? "text-amber-300"
        : "text-emerald-300";
  const rowBg =
    entry.outcome === "error"
      ? "bg-red-950/20"
      : entry.outcome === "warning"
        ? "bg-amber-950/10"
        : "";
  const route = routeForSave(entry.domain, entry.key, entry.action);
  const body = displayKey(entry.domain, entry.key);
  const action = entry.action === "deleted" ? "deleted" : "saved";
  // Only the row body links — avoids stealing scroll from the timestamp /
  // outcome / direction cells if the user wants to triple-click and copy.
  return (
    <li className={`flex flex-col gap-1 px-2 py-1 ${rowBg}`}>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-neutral-600" title={isoTitle}>
          {time}
        </span>
        <span className={`w-12 shrink-0 ${dirClass}`}>{dirLabel}</span>
        <span className="w-16 shrink-0 text-neutral-400">
          {labelForDomain(entry.domain).toLowerCase()}
        </span>
        <span className={`w-16 shrink-0 ${outcomeClass}`}>
          {entry.outcome}
        </span>
        <Link
          to={route}
          className="truncate text-neutral-200 underline-offset-2 hover:text-emerald-300 hover:underline"
          title={entry.path ?? body}
        >
          {body}
        </Link>
        <span className="shrink-0 text-neutral-600">— {action}</span>
      </div>
      {(entry.warnings && entry.warnings.length > 0) || entry.error ? (
        <div className="ml-[3.25rem] flex flex-col gap-0.5 text-neutral-500">
          {entry.error && (
            <span className="wrap-break-word text-red-300">
              ! {entry.error}
            </span>
          )}
          {entry.warnings?.map((w, i) => (
            <span key={i} className="wrap-break-word text-amber-300">
              ! {w}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}
