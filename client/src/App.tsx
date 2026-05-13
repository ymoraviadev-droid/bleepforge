import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { CatalogDatalists } from "./components/CatalogDatalists";
import { ContextMenuHost } from "./components/ContextMenu";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { ModalHost } from "./components/Modal";
import { NotFoundPage } from "./components/NotFoundPage";
import { Sidebar } from "./components/Sidebar";
import { SplashScreen } from "./components/SplashScreen";
import { ToastHost } from "./components/Toast";
import { ImageEditorHost } from "./features/asset/imageEditorHost";
import { isPopout } from "./lib/electron";
import { useShaderToasts } from "./lib/shaders/shaderToasts";
import { useSyncToasts } from "./lib/sync/syncToasts";
import { ConceptView } from "./features/concept/View";
import { ConceptEdit } from "./features/concept/Edit";
import { DialogList } from "./features/dialog/List";
import { DialogEdit } from "./features/dialog/Edit";
import { DialogGraph } from "./features/dialog/Graph";
import { AssetList } from "./features/asset/List";
import { ShaderEdit } from "./features/shader/Edit";
import { ShaderList } from "./features/shader/List";
import { BalloonList } from "./features/balloon/List";
import { BalloonEdit } from "./features/balloon/Edit";
import { CategoryEdit as CodexCategoryEdit } from "./features/codex/CategoryEdit";
import { Edit as CodexEntryEdit } from "./features/codex/Edit";
import { List as CodexList } from "./features/codex/List";
import { DiagnosticsPage } from "./features/diagnostics/DiagnosticsPage";
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
import { PreferencesPage } from "./features/preferences/PreferencesPage";
import { CategoryEdit as HelpCategoryEdit } from "./features/help/CategoryEdit";
import { CategoryView as HelpCategoryView } from "./features/help/CategoryView";
import { EntryEdit as HelpEntryEdit } from "./features/help/EntryEdit";
import { EntryView as HelpEntryView } from "./features/help/EntryView";
import { HelpLayout } from "./features/help/HelpLayout";
import { List as HelpList } from "./features/help/List";

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
  // Bridge .tres-save SSE events into pixel toasts. Mounted at App root so
  // every page gets the same notification surface. Shader toasts run on a
  // parallel hook against the .gdshader event channel, with echo-of-own-save
  // suppression so the user's own Save click doesn't double-feedback.
  useSyncToasts();
  useShaderToasts();

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  // Shell: Sidebar on the left (carries branding, version, meta icons,
  // search, AND the 11 domain nav links — all chrome in one column) +
  // main content area on the right. Popouts skip the sidebar entirely;
  // they're focused single-route subviews sized to fit their content.
  return (
    <div className="flex h-screen">
      {!popout && <Sidebar />}
      <CatalogDatalists />
      <ModalHost />
      <ContextMenuHost />
      <ToastHost />
      <ImageEditorHost />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
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
          <Route path="/shaders" element={<ShaderList />} />
          <Route path="/shaders/edit" element={<ShaderEdit />} />
          <Route path="/assets" element={<AssetList />} />
          <Route path="/diagnostics/*" element={<DiagnosticsPage />} />
          <Route path="/health" element={<Navigate to="/diagnostics" replace />} />
          <Route path="/health/integrity" element={<Navigate to="/diagnostics/integrity" replace />} />
          <Route path="/health/reconcile" element={<Navigate to="/diagnostics/reconcile" replace />} />
          <Route path="/integrity" element={<Navigate to="/diagnostics/integrity" replace />} />
          <Route path="/reconcile" element={<Navigate to="/diagnostics/reconcile" replace />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/import" element={<Navigate to="/preferences" replace />} />
          {/* View routes share HelpLayout — sidebar + allGroups state
              stay mounted across in-help navigation so clicking between
              entries doesn't unmount-and-remount the whole shell. Edit
              routes stay flat: different layout shape (full-width form),
              and they dispatch "Bleepforge:help-changed" after save so
              the layout refreshes the sidebar on return. */}
          <Route element={<HelpLayout />}>
            <Route path="/help" element={<HelpList />} />
            <Route path="/help/:category" element={<HelpCategoryView />} />
            <Route path="/help/:category/:id" element={<HelpEntryView />} />
          </Route>
          <Route path="/help/new" element={<HelpCategoryEdit />} />
          <Route path="/help/:category/_meta" element={<HelpCategoryEdit />} />
          <Route path="/help/:category/new" element={<HelpEntryEdit />} />
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
