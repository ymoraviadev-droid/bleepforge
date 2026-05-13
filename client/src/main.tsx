import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";
import { App, Boom } from "./App";
import { NotFoundPage } from "./components/NotFoundPage";
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
import { CategoryView as HelpCategoryView } from "./features/help/CategoryView";
import { EntryView as HelpEntryView } from "./features/help/EntryView";
import { HelpLayout } from "./features/help/HelpLayout";
import { List as HelpList } from "./features/help/List";
import "./styles/Theme"; // applies saved theme on load (sets data-theme on <html>)
import "./styles/Font"; // applies saved font + UI scale + letter spacing
import "./styles/GlobalTheme"; // reconciles legacy keys → server-backed preferences
import "./styles/index.css";
import { closeAssetStream, startAssetStream } from "./lib/assets/stream";
import { closeSavesStream, startSavesStream } from "./lib/saves/stream";
import { closeShaderStream, startShaderStream } from "./lib/shaders/stream";
import { closeSyncStream, startSyncStream } from "./lib/sync/stream";
import { closeGlobalThemeChannel } from "./styles/GlobalTheme";
import { refreshCatalog } from "./lib/catalog-bus";
import { markBootCheckpoint } from "./lib/boot/progress";

// Stamp the version into document.title so the OS window title bar shows
// "Bleepforge — v0.2.0" once the page loads. Electron's BrowserWindow
// `title` option is the *initial* title — index.html's <title> overrides
// it the moment the document parses. We set this here (before React
// renders) so the title is right from frame 1 and survives any future
// re-render. Browser mode benefits too: the browser tab title now carries
// the version.
//
// Popouts get a route-aware label so the OS title bar surfaces what the
// window is for — e.g. "Bleepforge — Diagnostics · v0.2.0". Derived from
// the first path segment; set-once-at-module-load (good enough for v1
// since popouts mostly stay within their original route subtree).
{
  const isPopoutWindow =
    new URLSearchParams(window.location.search).get("popout") === "1";
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  const label = isPopoutWindow && firstSegment
    ? firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
    : "";
  document.title = label
    ? `Bleepforge — ${label} · v${__APP_VERSION__}`
    : `Bleepforge — v${__APP_VERSION__}`;
}

// First boot checkpoint: server is up. Fires the splash's progress bar
// past the "Connecting to server…" phase. /api/health is a tiny cached
// endpoint, so this is essentially free. Failure leaves the checkpoint
// unmarked → splash hits its 10s timeout → user sees the "Continue
// anyway" affordance.
void fetch("/api/health")
  .then((r) => {
    if (r.ok) markBootCheckpoint("server");
  })
  .catch(() => {
    /* leave unmarked; splash timeout will surface the issue */
  });

// Open the live-sync SSE channel once at startup. Components subscribe via
// window's "Bleepforge:sync" CustomEvent.
startSyncStream();
// Same pattern, separate channel — saves cover both directions, so this
// drives the live updates in the Diagnostics → Saves tab.
startSavesStream();
// Third channel — image-asset add/change/remove for the gallery.
startAssetStream();
// Fourth channel — .gdshader add/change/remove for the shader gallery
// + edit page (external-edit banner).
startShaderStream();

// Refresh the autocomplete catalog on any external change so datalists
// stay current with the data the user just saw flow in from Godot.
// Shader events feed the same refresh — adding/renaming/removing a
// shader externally needs to flow into the Ctrl+K AppSearch index too.
window.addEventListener("Bleepforge:sync", () => refreshCatalog());
window.addEventListener("Bleepforge:shader", () => refreshCatalog());

// Renderer teardown cleanup. Without this, Electron's force-close of the
// renderer process leaves Chromium to forcibly cleanup our long-lived
// globals — 4 EventSources, 4 SSE-relay BroadcastChannels, the theme-
// sync BroadcastChannel — and that forced cleanup trips a CHECK on
// Chromium 130 / Linux, producing a SIGTRAP coredump every time the
// user closes a Bleepforge window. `pagehide` fires before Chromium
// kills the renderer, so we get a clean window to release everything
// gracefully. (`pagehide` over `beforeunload` because the latter is for
// "ask user to confirm" semantics; we just want to release resources.)
window.addEventListener("pagehide", () => {
  closeSyncStream();
  closeSavesStream();
  closeAssetStream();
  closeShaderStream();
  closeGlobalThemeChannel();
});

// Data router (v0.2.2) — replaced declarative <BrowserRouter> + <Routes>
// so `useBlocker` works in the unsaved-form guard. App.tsx is the
// layout element and renders <Outlet /> where these children mount.
//
// HelpLayout is a nested layout with its own children, so it carries
// the persistent help sidebar across in-help navigation without
// remounting the shell.
const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/concept" replace /> },
      { path: "concept", element: <ConceptView /> },
      { path: "concept/edit", element: <ConceptEdit /> },
      { path: "dialogs", element: <DialogGraph /> },
      { path: "dialogs/list", element: <DialogList /> },
      { path: "dialogs/new", element: <DialogEdit /> },
      { path: "dialogs/:folder/:id", element: <DialogEdit /> },
      { path: "balloons", element: <BalloonList /> },
      { path: "balloons/new", element: <BalloonEdit /> },
      { path: "balloons/:folder/:basename", element: <BalloonEdit /> },
      { path: "quests", element: <QuestList /> },
      { path: "quests/new", element: <QuestEdit /> },
      { path: "quests/:id", element: <QuestEdit /> },
      { path: "items", element: <ItemList /> },
      { path: "items/new", element: <ItemEdit /> },
      { path: "items/:slug", element: <ItemEdit /> },
      { path: "karma", element: <KarmaList /> },
      { path: "karma/new", element: <KarmaEdit /> },
      { path: "karma/:id", element: <KarmaEdit /> },
      { path: "npcs", element: <NpcList /> },
      { path: "npcs/new", element: <NpcEdit /> },
      { path: "npcs/:npcId", element: <NpcEdit /> },
      { path: "factions", element: <FactionList /> },
      { path: "factions/new", element: <FactionEdit /> },
      { path: "factions/:faction", element: <FactionEdit /> },
      { path: "codex", element: <CodexList /> },
      { path: "codex/new", element: <CodexCategoryEdit /> },
      { path: "codex/:category/_meta", element: <CodexCategoryEdit /> },
      { path: "codex/:category/new", element: <CodexEntryEdit /> },
      { path: "codex/:category/:id", element: <CodexEntryEdit /> },
      { path: "shaders", element: <ShaderList /> },
      { path: "shaders/edit", element: <ShaderEdit /> },
      { path: "assets", element: <AssetList /> },
      { path: "diagnostics/*", element: <DiagnosticsPage /> },
      { path: "health", element: <Navigate to="/diagnostics" replace /> },
      { path: "health/integrity", element: <Navigate to="/diagnostics/integrity" replace /> },
      { path: "health/reconcile", element: <Navigate to="/diagnostics/reconcile" replace /> },
      { path: "integrity", element: <Navigate to="/diagnostics/integrity" replace /> },
      { path: "reconcile", element: <Navigate to="/diagnostics/reconcile" replace /> },
      { path: "preferences", element: <PreferencesPage /> },
      { path: "import", element: <Navigate to="/preferences" replace /> },
      {
        element: <HelpLayout />,
        children: [
          { path: "help", element: <HelpList /> },
          { path: "help/:category", element: <HelpCategoryView /> },
          { path: "help/:category/:id", element: <HelpEntryView /> },
        ],
      },
      // Easter egg — /boom synchronously throws to verify the
      // ErrorBoundary's fallback UI.
      { path: "boom", element: <Boom /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
