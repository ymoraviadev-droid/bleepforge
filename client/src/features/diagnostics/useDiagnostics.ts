import { useEffect, useState } from "react";
import {
  logsApi,
  reconcileApi,
  type LogEntry,
  type ReconcileStatus,
} from "../../lib/api";
import { computeIssues } from "../../lib/integrity/issues";
import { useCatalog } from "../../lib/useCatalog";

// Aggregate diagnostic signal used by:
//   - The unified header icon (one indicator instead of two text links)
//   - The /diagnostics page's "default to the dirtiest tab" routing
//   - Tab labels (so each tab shows its own count, even when the header
//     icon surfaces a higher-priority tab's state)
//
// `severity` is the worst-of any tab. "error" = red, "warning" = amber,
// "clean" = emerald, "loading" = nothing yet.

export type DiagnosticsTabId =
  | "integrity"
  | "reconcile"
  | "logs"
  | "saves"
  | "process"
  | "watcher";

export interface TabSignal {
  id: DiagnosticsTabId;
  label: string;
  severity: "loading" | "clean" | "warning" | "error";
  count: number;
}

export interface DiagnosticsStatus {
  overall: "loading" | "clean" | "warning" | "error";
  /** Tab to highlight first when the user lands on /diagnostics without an
   *  explicit sub-route. Picks the worst tab; falls back to "integrity"
   *  when clean. */
  worstTab: DiagnosticsTabId;
  tabs: TabSignal[];
  reconcile: ReconcileStatus | null | undefined;
  logs: LogEntry[] | null | undefined;
  /** Sum of counts across all tabs — drives the numeric badge on the
   *  header icon. */
  totalCount: number;
}

const SEVERITY_RANK: Record<TabSignal["severity"], number> = {
  loading: -1,
  clean: 0,
  warning: 1,
  error: 2,
};

export function useDiagnostics(): DiagnosticsStatus {
  // Integrity comes from the catalog (already cached by useCatalog).
  const catalog = useCatalog();
  const issues = catalog ? computeIssues(catalog) : null;

  // Reconcile fetches once on mount — boot reconcile is the only writer, so
  // there's no need to poll. `undefined` = still fetching, `null` = endpoint
  // returned null (server hasn't reconciled yet).
  const [reconcile, setReconcile] = useState<ReconcileStatus | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let cancelled = false;
    reconcileApi
      .getStatus()
      .then((s) => {
        if (!cancelled) setReconcile(s);
      })
      .catch(() => {
        if (!cancelled) setReconcile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Logs — same one-shot pattern. The Logs tab itself manages its own
  // refresh-on-demand state for the live view; this hook just needs enough
  // signal to drive the header icon's color + badge. New errors after the
  // initial fetch won't bump the icon until the user reloads — acceptable
  // tradeoff for v1, see logs/buffer.ts comments.
  const [logs, setLogs] = useState<LogEntry[] | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    logsApi
      .list()
      .then((l) => {
        if (!cancelled) setLogs(l);
      })
      .catch(() => {
        if (!cancelled) setLogs(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const integrityTab: TabSignal = (() => {
    if (issues === null)
      return { id: "integrity", label: "Integrity", severity: "loading", count: 0 };
    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    if (errors > 0)
      return { id: "integrity", label: "Integrity", severity: "error", count: errors + warnings };
    if (warnings > 0)
      return { id: "integrity", label: "Integrity", severity: "warning", count: warnings };
    return { id: "integrity", label: "Integrity", severity: "clean", count: 0 };
  })();

  const reconcileTab: TabSignal = (() => {
    if (reconcile === undefined)
      return { id: "reconcile", label: "Reconcile", severity: "loading", count: 0 };
    if (reconcile === null)
      return { id: "reconcile", label: "Reconcile", severity: "loading", count: 0 };
    if (!reconcile.ok || reconcile.errorDetails.length > 0)
      return {
        id: "reconcile",
        label: "Reconcile",
        severity: "error",
        count: reconcile.errorDetails.length || 1,
      };
    if (reconcile.skippedDetails.length > 0)
      return {
        id: "reconcile",
        label: "Reconcile",
        severity: "warning",
        count: reconcile.skippedDetails.length,
      };
    return { id: "reconcile", label: "Reconcile", severity: "clean", count: 0 };
  })();

  const logsTab: TabSignal = (() => {
    if (logs === undefined || logs === null)
      return { id: "logs", label: "Logs", severity: "loading", count: 0 };
    const errorCount = logs.filter((l) => l.level === "error").length;
    const warnCount = logs.filter((l) => l.level === "warning").length;
    if (errorCount > 0)
      return { id: "logs", label: "Logs", severity: "error", count: errorCount };
    if (warnCount > 0)
      return { id: "logs", label: "Logs", severity: "warning", count: warnCount };
    return { id: "logs", label: "Logs", severity: "clean", count: 0 };
  })();

  // Saves, Process, and Watcher are informational — no severity contribution.
  // They show up in the tab bar but never bump the header icon. Failed
  // watcher reimports and outgoing writes already surface via the Logs tab
  // (console.error / console.log capture); contributing here would just be
  // double-counting.
  const savesTab: TabSignal = {
    id: "saves",
    label: "Saves",
    severity: "clean",
    count: 0,
  };
  const processTab: TabSignal = {
    id: "process",
    label: "Process",
    severity: "clean",
    count: 0,
  };
  const watcherTab: TabSignal = {
    id: "watcher",
    label: "Watcher",
    severity: "clean",
    count: 0,
  };

  const tabs = [integrityTab, reconcileTab, logsTab, savesTab, processTab, watcherTab];
  const worstSeverity = tabs.reduce<TabSignal["severity"]>(
    (worst, t) => (SEVERITY_RANK[t.severity] > SEVERITY_RANK[worst] ? t.severity : worst),
    "clean",
  );
  const worstTab =
    tabs.find((t) => t.severity === worstSeverity)?.id ?? "integrity";
  const totalCount = tabs.reduce((n, t) => n + t.count, 0);

  return {
    overall: worstSeverity === "loading" ? "loading" : worstSeverity,
    worstTab,
    tabs,
    reconcile,
    logs,
    totalCount,
  };
}
