import { Navigate, NavLink, Route, Routes, useParams } from "react-router";
import { IntegrityTab } from "./IntegrityTab";
import { ReconcileTab } from "./ReconcileTab";
import { useHealthStatus, type HealthTabId, type TabSignal } from "./useHealthStatus";

// Aggregated diagnostic dashboard. Tabs replace what used to be two
// standalone pages (/integrity, /reconcile). The unified entry point
// answers a single user question — "is anything wrong with my project?"
// — instead of asking the user to know which kind of "wrong" applies.
//
// Routing:
//   /health              → redirects to the dirtiest tab (or integrity when clean)
//   /health/integrity    → integrity tab
//   /health/reconcile    → reconcile tab
//
// The old /integrity and /reconcile routes redirect to /health/<tab> for
// back-compat with bookmarks.

const VALID_TABS: HealthTabId[] = ["integrity", "reconcile"];

export function HealthPage() {
  return (
    <Routes>
      <Route index element={<DefaultRedirect />} />
      <Route path=":tab" element={<TabbedView />} />
    </Routes>
  );
}

function DefaultRedirect() {
  const status = useHealthStatus();
  // While loading, default to integrity so we don't bounce the user once data
  // settles. Once loaded, route to the worst tab.
  return <Navigate to={status.worstTab} replace />;
}

function TabbedView() {
  const { tab } = useParams<{ tab: string }>();
  const status = useHealthStatus();
  const active: HealthTabId = VALID_TABS.includes(tab as HealthTabId)
    ? (tab as HealthTabId)
    : "integrity";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Health</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Project diagnostics — authored content + the .tres → JSON cache.
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
      to={`/health/${signal.id}`}
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
