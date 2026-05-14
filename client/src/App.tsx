import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { CatalogDatalists } from "./components/CatalogDatalists";
import { ContextMenuHost } from "./components/ContextMenu";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { ModalHost } from "./components/Modal";
import { Sidebar } from "./components/Sidebar";
import { SplashScreen } from "./components/SplashScreen";
import { ToastHost } from "./components/Toast";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ImageEditorHost } from "./features/asset/imageEditorHost";
import { isPopout } from "./lib/electron";
import { useOutgoingSaveToasts } from "./lib/saves/outgoingSaveToasts";
import { useShaderToasts } from "./lib/shaders/shaderToasts";
import { useSyncToasts } from "./lib/sync/syncToasts";
import { useGodotProjectRoot } from "./styles/GlobalTheme";

// App is the *layout* element of the data router (v0.2.2) — the route
// table moved to main.tsx as a `createBrowserRouter` config, and this
// component just owns the chrome (sidebar + main wrapper + hosts) plus
// the splash + boot bridges. The active route renders into <Outlet />.
//
// Why data router: useBlocker (the in-app navigation guard backing
// useUnsavedWarning's "Discard unsaved changes?" modal) only works
// inside a data router context. The declarative <BrowserRouter> +
// <Routes> shape threw "useBlocker must be used within a data router"
// at runtime. Migrated to fix.

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

  // Welcome screen gate. When godotProjectRoot is empty (fresh install,
  // no preferences.json yet), the server is in limp mode and most app
  // features render empty. Show WelcomeScreen instead until the user
  // picks a folder + restarts. Popouts skip this — they can only be
  // opened from the main window, so if main is on welcome, no popouts
  // exist anyway. Hook subscribes to changes so the screen unmounts
  // automatically once the value is set.
  const { saved: godotProjectRoot } = useGodotProjectRoot();

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
  // Bridge save events into pixel toasts. Three hooks, three directions:
  //   - useSyncToasts: INCOMING .tres saves (Godot → Bleepforge) via the
  //     sync SSE stream. Emerald "success" variant, title "X updated
  //     externally".
  //   - useShaderToasts: INCOMING .gdshader saves via the shader SSE
  //     stream, with per-window echo-of-own-save suppression.
  //   - useOutgoingSaveToasts: OUTGOING saves (Bleepforge → disk) for
  //     every domain via the saves SSE stream. Cyan "saved" variant,
  //     title "Saved X". Distinguishes at-a-glance from the incoming
  //     toasts (color + title both carry direction).
  useSyncToasts();
  useShaderToasts();
  useOutgoingSaveToasts();

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (!popout && !godotProjectRoot) {
    return <WelcomeScreen />;
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
            <Outlet />
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
export function Boom(): never {
  throw new Error("Boom — test error for ErrorBoundary verification");
}
