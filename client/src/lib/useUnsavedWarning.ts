import { useEffect } from "react";

// Guards against losing unsaved form work when the user closes the
// window, refreshes, or hits the AppImage's close button. Sets
// `returnValue` on `beforeunload` so Chromium / Electron shows its
// native "Leave Site? Changes you made may not be saved." prompt. The
// dialog text isn't ours to customize (every modern browser locked
// that down for phishing reasons), but the prompt does appear and the
// user can cancel.
//
// Fires only while `dirty === true`. Pass `useExternalChange`'s
// returned dirty value (or any other boolean) in.
//
// Deferred scope — IN-APP NAVIGATION:
// React Router exposes `useBlocker` for intercepting in-app
// navigations (clicking a different nav item, pressing Back, etc.),
// but it only works inside a DATA router (createBrowserRouter +
// RouterProvider). The app currently uses declarative <BrowserRouter>;
// migrating to the data-router API is meaningful surgery touching
// every layout route. Until that lands, in-app nav-while-dirty still
// silently drops form state — same as before. Window close (the
// most destructive case) is covered here.

export function useUnsavedWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Both forms needed for cross-browser coverage. Chromium /
      // Electron use preventDefault + returnValue; Firefox respects
      // returnValue alone. The dialog text is browser-controlled — we
      // can't supply our own copy.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
