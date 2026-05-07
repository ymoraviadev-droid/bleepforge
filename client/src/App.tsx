import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { reconcileApi, type ReconcileStatus } from "./api";
import { CatalogDatalists } from "./CatalogDatalists";
import { ContextMenuHost } from "./ContextMenu";
import { ModalHost } from "./Modal";
import { SplashScreen } from "./SplashScreen";
import { useCatalog } from "./useCatalog";
import { ConceptView } from "./concept/View";
import { ConceptEdit } from "./concept/Edit";
import { DialogList } from "./dialog/List";
import { DialogEdit } from "./dialog/Edit";
import { DialogGraph } from "./dialog/Graph";
import { IntegrityPage } from "./integrity/IntegrityPage";
import { computeIssues } from "./integrity/issues";
import { QuestList } from "./quest/List";
import { QuestEdit } from "./quest/Edit";
import { ItemList } from "./item/List";
import { ItemEdit } from "./item/Edit";
import { KarmaList } from "./karma/List";
import { KarmaEdit } from "./karma/Edit";
import { NpcList } from "./npc/List";
import { NpcEdit } from "./npc/Edit";
import { FactionList } from "./faction/List";
import { FactionEdit } from "./faction/Edit";
import { GearIcon } from "./preferences/GearIcon";
import { PreferencesPage } from "./preferences/PreferencesPage";
import { ReconcilePage } from "./reconcile/StatusPage";

const NAV_BASE = "border-2 px-3 py-1.5 text-sm font-medium transition-colors";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${NAV_BASE} ${
    isActive
      ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
      : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

// Variant for the Integrity link when the catalog has dangling references.
// Keeps the same shape as navLinkClass but in red so it pulls the eye.
const integrityWarnClass = ({ isActive }: { isActive: boolean }) =>
  `${NAV_BASE} ${
    isActive
      ? "border-red-600 bg-red-950/40 text-red-200"
      : "border-red-900/60 bg-red-950/20 text-red-300 hover:border-red-700 hover:bg-red-950/40 hover:text-red-200"
  }`;

// Reconcile diagnostic link — only renders when there's something to fix
// (boring infrastructure when working, urgent when broken). Red on errors,
// amber on skip-only.
const reconcileWarnClass = (tone: "red" | "amber") =>
  ({ isActive }: { isActive: boolean }) => {
    const palette =
      tone === "red"
        ? {
            active: "border-red-600 bg-red-950/40 text-red-200",
            idle: "border-red-900/60 bg-red-950/20 text-red-300 hover:border-red-700 hover:bg-red-950/40 hover:text-red-200",
          }
        : {
            active: "border-amber-600 bg-amber-950/40 text-amber-200",
            idle: "border-amber-900/60 bg-amber-950/20 text-amber-300 hover:border-amber-700 hover:bg-amber-950/40 hover:text-amber-200",
          };
    return `${NAV_BASE} ${isActive ? palette.active : palette.idle}`;
  };

const prefsNavClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center justify-center border-2 p-1.5 transition-colors ${
    isActive
      ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
      : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

export function App() {
  // Splash fires on every fresh mount (i.e. real refresh / first load).
  // The current URL is preserved across the splash because the router doesn't
  // re-mount — F5 on /quests goes splash → /quests; logo click does
  // location.href = "/" which both reloads AND lands on /concept.
  // Eventually replaced by Tauri's native splash for the desktop build.
  const [showSplash, setShowSplash] = useState(true);

  // Browsers restore a previously-rendered page from the back-forward cache
  // when you navigate back to it (e.g. Google → click → app, then back ←
  // forward → app). bfcache restores the React state too, so showSplash is
  // already `false` and the splash silently skips. Detect via `pageshow`
  // with `event.persisted === true` and re-trigger the splash so the user
  // gets the same intro as a real first load.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setShowSplash(true);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  const catalog = useCatalog();
  const issueCount = catalog ? computeIssues(catalog).length : 0;
  const integrityClean = catalog !== null && issueCount === 0;
  const integrityDirty = catalog !== null && issueCount > 0;

  // Boot-reconcile diagnostic. Fetched once on mount; the only writer is
  // server boot, so polling isn't needed. The link only appears when there
  // are issues — see reconcileWarnClass.
  const [reconcile, setReconcile] = useState<ReconcileStatus | null>(null);
  useEffect(() => {
    reconcileApi.getStatus().then(setReconcile).catch(() => {});
  }, []);
  const reconcileErrors = reconcile?.errorDetails.length ?? 0;
  const reconcileSkipped = reconcile?.skippedDetails.length ?? 0;
  const reconcileBroken = reconcile && !reconcile.ok;
  const reconcileTone: "red" | "amber" | null =
    reconcileBroken || reconcileErrors > 0
      ? "red"
      : reconcileSkipped > 0
        ? "amber"
        : null;

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-6 border-b-2 border-neutral-800 bg-neutral-950 px-6 py-4">
        <button
          type="button"
          onClick={() => {
            // Hard reload to /. Replays the splash and lands on /concept.
            window.location.href = "/";
          }}
          className="font-display text-sm tracking-wider text-emerald-400 transition-colors hover:text-emerald-300"
          title="Refresh to home"
        >
          BLEEPFORGE
        </button>
        <nav className="flex gap-2">
          <NavLink to="/concept" className={navLinkClass}>
            Game concept
          </NavLink>
          <NavLink to="/factions" className={navLinkClass}>
            Factions
          </NavLink>
          <NavLink to="/npcs" className={navLinkClass}>
            NPCs
          </NavLink>
          <NavLink to="/quests" className={navLinkClass}>
            Quests
          </NavLink>
          <NavLink to="/karma" className={navLinkClass}>
            Karma
          </NavLink>
          <NavLink to="/dialogs" className={navLinkClass}>
            Dialogs
          </NavLink>
          <NavLink to="/items" className={navLinkClass}>
            Items
          </NavLink>
          <NavLink
            to="/integrity"
            className={integrityDirty ? integrityWarnClass : navLinkClass}
            title={
              integrityDirty
                ? `${issueCount} integrity issue${issueCount === 1 ? "" : "s"}`
                : integrityClean
                  ? "Integrity check is clean"
                  : "Integrity"
            }
          >
            Integrity{" "}
            {integrityClean && (
              <span className="text-emerald-400" aria-label="clean">
                ✓
              </span>
            )}
            {integrityDirty && (
              <span className="ml-0.5 font-mono text-[10px]">
                ({issueCount})
              </span>
            )}
          </NavLink>
          {reconcileTone && (
            <NavLink
              to="/reconcile"
              className={reconcileWarnClass(reconcileTone)}
              title={
                reconcileBroken
                  ? "Reconcile aborted — JSON cache may be stale"
                  : reconcileErrors > 0
                    ? `${reconcileErrors} reconcile error${reconcileErrors === 1 ? "" : "s"}`
                    : `${reconcileSkipped} file${reconcileSkipped === 1 ? "" : "s"} skipped during reconcile`
              }
            >
              Reconcile{" "}
              <span className="ml-0.5 font-mono text-[10px]">
                ({reconcileErrors > 0 ? reconcileErrors : reconcileSkipped})
              </span>
            </NavLink>
          )}
        </nav>
        <div className="flex-1" />
        <NavLink
          to="/preferences"
          className={prefsNavClass}
          title="Preferences"
          aria-label="Preferences"
        >
          <GearIcon size={20} />
        </NavLink>
      </header>
      <CatalogDatalists />
      <ModalHost />
      <ContextMenuHost />
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/concept" replace />} />
          <Route path="/concept" element={<ConceptView />} />
          <Route path="/concept/edit" element={<ConceptEdit />} />
          <Route path="/dialogs" element={<DialogGraph />} />
          <Route path="/dialogs/list" element={<DialogList />} />
          <Route path="/dialogs/new" element={<DialogEdit />} />
          <Route path="/dialogs/:folder/:id" element={<DialogEdit />} />
          <Route path="/quests" element={<QuestList />} />
          <Route path="/quests/new" element={<QuestEdit />} />
          <Route path="/quests/:id" element={<QuestEdit />} />
          <Route path="/items" element={<ItemList />} />
          <Route path="/items/new" element={<ItemEdit />} />
          <Route path="/items/:slug" element={<ItemEdit />} />
          <Route path="/karma" element={<KarmaList />} />
          <Route path="/karma/new" element={<KarmaEdit />} />
          <Route path="/karma/:id" element={<KarmaEdit />} />
          <Route path="/npcs" element={<NpcList />} />
          <Route path="/npcs/new" element={<NpcEdit />} />
          <Route path="/npcs/:npcId" element={<NpcEdit />} />
          <Route path="/factions" element={<FactionList />} />
          <Route path="/factions/new" element={<FactionEdit />} />
          <Route path="/factions/:faction" element={<FactionEdit />} />
          <Route path="/integrity" element={<IntegrityPage />} />
          <Route path="/reconcile" element={<ReconcilePage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/import" element={<Navigate to="/preferences" replace />} />
        </Routes>
      </main>
    </div>
  );
}
