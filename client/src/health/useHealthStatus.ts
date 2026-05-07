import { useEffect, useState } from "react";
import { reconcileApi, type ReconcileStatus } from "../api";
import { computeIssues } from "../integrity/issues";
import { useCatalog } from "../useCatalog";

// Aggregate health signal used by:
//   - The unified header indicator (one badge instead of two)
//   - The /health page's "default to the dirtiest tab" routing
//   - Tab labels (so each tab shows its own count, even when the header
//     badge surfaces a higher-priority tab's state)
//
// `severity` is the worst-of any tab. "error" = red, "warning" = amber,
// "clean" = emerald, "loading" = nothing yet.

export type HealthTabId = "integrity" | "reconcile";

export interface TabSignal {
  id: HealthTabId;
  label: string;
  severity: "loading" | "clean" | "warning" | "error";
  count: number;
}

export interface HealthStatus {
  overall: "loading" | "clean" | "warning" | "error";
  /** Tab to highlight first when the user lands on /health without an explicit
   *  sub-route. Picks the worst tab; falls back to "integrity" when clean. */
  worstTab: HealthTabId;
  tabs: TabSignal[];
  reconcile: ReconcileStatus | null | undefined;
}

const SEVERITY_RANK: Record<TabSignal["severity"], number> = {
  loading: -1,
  clean: 0,
  warning: 1,
  error: 2,
};

export function useHealthStatus(): HealthStatus {
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

  const tabs = [integrityTab, reconcileTab];
  const worstSeverity = tabs.reduce<TabSignal["severity"]>(
    (worst, t) => (SEVERITY_RANK[t.severity] > SEVERITY_RANK[worst] ? t.severity : worst),
    "clean",
  );
  const worstTab =
    tabs.find((t) => t.severity === worstSeverity)?.id ?? "integrity";

  return {
    overall: worstSeverity === "loading" ? "loading" : worstSeverity,
    worstTab,
    tabs,
    reconcile,
  };
}
