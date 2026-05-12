import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { AppSearch } from "./components/AppSearch";
import { CatalogDatalists } from "./components/CatalogDatalists";
import { ContextMenuHost } from "./components/ContextMenu";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { ModalHost, showConfirm } from "./components/Modal";
import { NotFoundPage } from "./components/NotFoundPage";
import { RestartIcon } from "./components/RestartIcon";
import { SplashScreen } from "./components/SplashScreen";
import { ToastHost } from "./components/Toast";
import { ImageEditorHost } from "./features/asset/imageEditorHost";
import { isElectron, isPopout, popoutOrNavigate, restartApp } from "./lib/electron";
import { useSyncToasts } from "./lib/sync/syncToasts";
import { ConceptView } from "./features/concept/View";
import { ConceptEdit } from "./features/concept/Edit";
import { DialogList } from "./features/dialog/List";
import { DialogEdit } from "./features/dialog/Edit";
import { DialogGraph } from "./features/dialog/Graph";
import { AssetList } from "./features/asset/List";
import { BalloonList } from "./features/balloon/List";
import { BalloonEdit } from "./features/balloon/Edit";
import { CategoryEdit as CodexCategoryEdit } from "./features/codex/CategoryEdit";
import { Edit as CodexEntryEdit } from "./features/codex/Edit";
import { List as CodexList } from "./features/codex/List";
import { DiagnosticsIcon } from "./features/diagnostics/DiagnosticsIcon";
import { DiagnosticsPage } from "./features/diagnostics/DiagnosticsPage";
import { useDiagnostics } from "./features/diagnostics/useDiagnostics";
import { QuestList } from "./features/quest/List";
import { QuestEdit } from "./features/quest/Edit";
import { ItemList } from "./features/item/List";
import { ItemEdit } from "./features/item/Edit";
import { KarmaList } from "./features/karma/List";
import { KarmaEdit } from "./features/karma/Edit";
import { NpcList } from "./features/npc/List";
import { NpcEdit } from "./features/npc/Edit";
import { FactionList } from "./features/faction/List";
import { FactionEdit } from "./features/faction/Edit";
import { GearIcon } from "./features/preferences/GearIcon";
import { PreferencesPage } from "./features/preferences/PreferencesPage";
import { CategoryEdit as HelpCategoryEdit } from "./features/help/CategoryEdit";
import { CategoryView as HelpCategoryView } from "./features/help/CategoryView";
import { EntryEdit as HelpEntryEdit } from "./features/help/EntryEdit";
import { EntryView as HelpEntryView } from "./features/help/EntryView";
import { HelpIcon } from "./features/help/HelpIcon";
import { List as HelpList } from "./features/help/List";

const NAV_BASE = "border-2 px-3 py-1.5 text-sm font-medium transition-colors";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${NAV_BASE} ${
    isActive
      ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
      : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

// Square icon-button class, shared by Diagnostics and Preferences. The two
// sit together on the right side of the header — both are meta actions
// (about the app, not the project content), so they share the same shape.
const iconNavBase =
  "relative flex items-center justify-center border-2 p-1.5 transition-colors";

const prefsNavClass = ({ isActive }: { isActive: boolean }) =>
  `${iconNavBase} ${
    isActive
      ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
      : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

// Header restart icon → confirm modal → Electron relaunch. The Godot
// project root is captured once at server boot (and any future per-domain
// folder overrides will be too), so changing it via Preferences requires
// a fresh server. The action lives in the header instead of buried in
// Preferences so post-config nudges are one click away from anywhere in
// the app. Browser mode hides the button — there's no useful "restart"
// there since the server is launched independently.
async function handleRestart(): Promise<void> {
  const ok = await showConfirm({
    title: "Restart Bleepforge?",
    message:
      "Any unsaved edits in open forms will be lost. Use this after changing the Godot project root in Preferences, or to pick up other boot-captured config.",
    confirmLabel: "Restart",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (!ok) return;
  await restartApp();
}

function diagnosticsTitle(
  severity: "loading" | "clean" | "warning" | "error",
  count: number,
): string {
  if (severity === "error")
    return `Diagnostics: ${count} issue${count === 1 ? "" : "s"}`;
  if (severity === "warning")
    return `Diagnostics: ${count} warning${count === 1 ? "" : "s"}`;
  if (severity === "clean") return "Diagnostics — all clear";
  return "Diagnostics";
}

// Severity-aware variant for the Diagnostics icon. Stroke color tells you
// instantly whether anything's wrong (red error, amber warning, neutral when
// clean — emerald reserved for the active-link state, same as the gear).
const diagNavClass = (
  severity: "loading" | "clean" | "warning" | "error",
) =>
  ({ isActive }: { isActive: boolean }) => {
    if (severity === "error") {
      return `${iconNavBase} ${
        isActive
          ? "border-red-600 bg-red-950/40 text-red-300"
          : "border-transparent text-red-400 hover:border-red-700 hover:bg-red-950/30 hover:text-red-300"
      }`;
    }
    if (severity === "warning") {
      return `${iconNavBase} ${
        isActive
          ? "border-amber-600 bg-amber-950/40 text-amber-300"
          : "border-transparent text-amber-400 hover:border-amber-700 hover:bg-amber-950/30 hover:text-amber-300"
      }`;
    }
    // Clean / loading — same neutral shape as the gear next to it.
    return prefsNavClass({ isActive });
  };

export function App() {
  // Popouts (chromeless secondary windows opened by Electron for
  // Diagnostics / Help / Preferences) live for the lifetime of one
  // window; the URL ?popout=1 marker is read once at module load so
  // in-popout React Router navigations don't lose the chromeless layout.
  const popout = isPopout();

  // Splash fires on every fresh mount (i.e. real refresh / first load).
  // The current URL is preserved across the splash because the router doesn't
  // re-mount — F5 on /quests goes splash → /quests; logo click does
  // location.href = "/" which both reloads AND lands on /concept.
  // Popouts skip the splash — they're focused subviews, not full sessions.
  const [showSplash, setShowSplash] = useState(!popout);

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
  // Unified diagnostic signal: integrity (authored data) + reconcile (.tres
  // cache infra) folded into one severity. Single icon on the right side of
  // the header carries it — square, color-shifted by state, with a small
  // numeric badge in the corner when there's something to fix. Boring icon
  // when clean, urgent when not.
  const diagnostics = useDiagnostics();

  // Bridge .tres-save SSE events into pixel toasts. Mounted at App root so
  // every page gets the same notification surface.
  useSyncToasts();

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  return (
    <div className="flex h-screen flex-col">
      {!popout && (
      <header className="flex shrink-0 items-center gap-6 border-b-2 border-neutral-800 bg-neutral-950 px-6 py-4">
        <span
          className="font-display text-sm tracking-wider text-emerald-400 select-none"
          aria-label="Bleepforge"
        >
          BLEEPFORGE
        </span>
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
          <NavLink to="/balloons" className={navLinkClass}>
            Balloons
          </NavLink>
          <NavLink to="/items" className={navLinkClass}>
            Items
          </NavLink>
          <NavLink to="/codex" className={navLinkClass}>
            Game codex
          </NavLink>
          <NavLink to="/assets" className={navLinkClass}>
            Assets
          </NavLink>
        </nav>
        <div className="flex-1" />
        <AppSearch />
        <NavLink
          to="/diagnostics"
          onClick={(e) => popoutOrNavigate(e, "/diagnostics")}
          className={diagNavClass(diagnostics.overall)}
          title={diagnosticsTitle(diagnostics.overall, diagnostics.totalCount)}
          aria-label={diagnosticsTitle(diagnostics.overall, diagnostics.totalCount)}
        >
          <DiagnosticsIcon size={20} />
          {diagnostics.totalCount > 0 && (
            // Small square badge anchored to the icon's top-right corner.
            // Square (not rounded-full) to match the chunky pixel aesthetic.
            // Background tracks severity so it reads even at a glance.
            <span
              className={`absolute -right-1 -top-1 flex min-w-3.5 items-center justify-center border border-neutral-950 px-0.5 font-mono text-[9px] font-semibold leading-none text-white ${
                diagnostics.overall === "error" ? "bg-red-600" : "bg-amber-600"
              }`}
            >
              {diagnostics.totalCount > 99 ? "99+" : diagnostics.totalCount}
            </span>
          )}
        </NavLink>
        <NavLink
          to="/preferences"
          onClick={(e) => popoutOrNavigate(e, "/preferences")}
          className={prefsNavClass}
          title="Preferences"
          aria-label="Preferences"
        >
          <GearIcon size={20} />
        </NavLink>
        <NavLink
          to="/help"
          onClick={(e) => popoutOrNavigate(e, "/help")}
          className={prefsNavClass}
          title="Help"
          aria-label="Help"
        >
          <HelpIcon size={20} />
        </NavLink>
        {isElectron() && (
          <button
            type="button"
            onClick={handleRestart}
            className={prefsNavClass({ isActive: false })}
            title="Restart Bleepforge"
            aria-label="Restart Bleepforge"
          >
            <RestartIcon size={20} />
          </button>
        )}
      </header>
      )}
      <CatalogDatalists />
      <ModalHost />
      <ContextMenuHost />
      <ToastHost />
      <ImageEditorHost />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ErrorBoundary>
        <div className="flex-1 px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/concept" replace />} />
          <Route path="/concept" element={<ConceptView />} />
          <Route path="/concept/edit" element={<ConceptEdit />} />
          <Route path="/dialogs" element={<DialogGraph />} />
          <Route path="/dialogs/list" element={<DialogList />} />
          <Route path="/dialogs/new" element={<DialogEdit />} />
          <Route path="/dialogs/:folder/:id" element={<DialogEdit />} />
          <Route path="/balloons" element={<BalloonList />} />
          <Route path="/balloons/new" element={<BalloonEdit />} />
          <Route path="/balloons/:folder/:basename" element={<BalloonEdit />} />
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
          <Route path="/codex" element={<CodexList />} />
          <Route path="/codex/new" element={<CodexCategoryEdit />} />
          <Route path="/codex/:category/_meta" element={<CodexCategoryEdit />} />
          <Route path="/codex/:category/new" element={<CodexEntryEdit />} />
          <Route path="/codex/:category/:id" element={<CodexEntryEdit />} />
          <Route path="/assets" element={<AssetList />} />
          <Route path="/diagnostics/*" element={<DiagnosticsPage />} />
          <Route path="/health" element={<Navigate to="/diagnostics" replace />} />
          <Route path="/health/integrity" element={<Navigate to="/diagnostics/integrity" replace />} />
          <Route path="/health/reconcile" element={<Navigate to="/diagnostics/reconcile" replace />} />
          <Route path="/integrity" element={<Navigate to="/diagnostics/integrity" replace />} />
          <Route path="/reconcile" element={<Navigate to="/diagnostics/reconcile" replace />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/import" element={<Navigate to="/preferences" replace />} />
          <Route path="/help" element={<HelpList />} />
          <Route path="/help/new" element={<HelpCategoryEdit />} />
          <Route path="/help/:category" element={<HelpCategoryView />} />
          <Route path="/help/:category/_meta" element={<HelpCategoryEdit />} />
          <Route path="/help/:category/new" element={<HelpEntryEdit />} />
          <Route path="/help/:category/:id" element={<HelpEntryView />} />
          <Route path="/help/:category/:id/edit" element={<HelpEntryEdit />} />
          {/* Easter egg — visit /boom to verify the ErrorBoundary by tripping
              a synchronous render-phase throw. Kept around as a manual-test
              hook (and because it's funny). */}
          <Route path="/boom" element={<Boom />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </div>
        {!popout && <Footer />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

// Easter-egg page that throws synchronously during render so /boom always
// trips the ErrorBoundary. Useful as a manual-test hook for the boundary's
// fallback UI; small enough that it doesn't earn its own file.
function Boom(): never {
  throw new Error("Boom — test error for ErrorBoundary verification");
}
