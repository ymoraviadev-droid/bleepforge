import { Navigate, NavLink, Route, Routes, useParams } from "react-router";
import { IntegrityTab } from "./IntegrityTab";
import { LogsTab } from "./LogsTab";
import { ReconcileTab } from "./ReconcileTab";
import {
  useDiagnostics,
  type DiagnosticsTabId,
  type TabSignal,
} from "./useDiagnostics";

// Aggregated diagnostic dashboard. Tabs replace what used to be two
// standalone pages (/integrity, /reconcile). The unified entry point
// answers a single user question — "is anything wrong with my project?"
// — instead of asking the user to know which kind of "wrong" applies.
//
// Routing:
//   /diagnostics              → redirects to the dirtiest tab (or integrity when clean)
//   /diagnostics/integrity    → integrity tab
//   /diagnostics/reconcile    → reconcile tab
//
// The legacy /integrity, /reconcile, and /health routes redirect to
// /diagnostics/<tab> (see App.tsx) so any old bookmark still lands.

const VALID_TABS: DiagnosticsTabId[] = ["integrity", "reconcile", "logs"];

export function DiagnosticsPage() {
  return (
    <Routes>
      <Route index element={<DefaultRedirect />} />
      <Route path=":tab" element={<TabbedView />} />
    </Routes>
  );
}

function DefaultRedirect() {
  const status = useDiagnostics();
  // While loading, default to integrity so we don't bounce the user once data
  // settles. Once loaded, route to the worst tab.
  return <Navigate to={status.worstTab} replace />;
}

function TabbedView() {
  const { tab } = useParams<{ tab: string }>();
  const status = useDiagnostics();
  const active: DiagnosticsTabId = VALID_TABS.includes(tab as DiagnosticsTabId)
    ? (tab as DiagnosticsTabId)
    : "integrity";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Diagnostics</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Project status — authored content + the .tres → JSON cache.
        </p>
      </div>

      <nav className="flex gap-2 border-b-2 border-neutral-800">
        {status.tabs.map((t) => (
          <TabLink key={t.id} signal={t} active={t.id === active} />
        ))}
      </nav>

      <div>
        {active === "integrity" && <IntegrityTab />}
        {active === "reconcile" && <ReconcileTab />}
        {active === "logs" && <LogsTab />}
      </div>
    </div>
  );
}

function TabLink({ signal, active }: { signal: TabSignal; active: boolean }) {
  const tone =
    signal.severity === "error"
      ? "text-red-300"
      : signal.severity === "warning"
        ? "text-amber-300"
        : signal.severity === "clean"
          ? "text-emerald-400"
          : "text-neutral-400";

  return (
    <NavLink
      to={`/diagnostics/${signal.id}`}
      className={() =>
        `border-b-2 px-3 py-2 text-sm transition-colors ${
          active
            ? "border-emerald-500 text-neutral-100"
            : "border-transparent text-neutral-400 hover:text-neutral-200"
        }`
      }
    >
      {signal.label}{" "}
      {signal.severity === "loading" ? null : signal.severity === "clean" ? (
        <span className={`ml-1 ${tone}`} aria-label="clean">
          ✓
        </span>
      ) : (
        <span className={`ml-1 font-mono text-[10px] ${tone}`}>
          ({signal.count})
        </span>
      )}
    </NavLink>
  );
}
