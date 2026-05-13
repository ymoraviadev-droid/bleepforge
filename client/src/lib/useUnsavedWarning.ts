import { useEffect } from "react";
import { useBlocker } from "react-router";

import { showConfirm } from "../components/Modal";

// Guards against losing unsaved form work on TWO surfaces:
//
//   1. Browser-level events (window close / refresh / AppImage quit /
//      tab close) — handled via `beforeunload`. Sets `returnValue` so
//      Chromium / Electron surface their native "Leave Site? Changes
//      you made may not be saved." prompt. The dialog text isn't ours
//      to customize (every modern browser locked that down for
//      phishing reasons), but the prompt does appear and the user
//      can cancel.
//
//   2. In-app navigation (clicking a different sidebar link, hitting
//      Back, any <Link> click that changes pathname) — handled via
//      React Router v7's `useBlocker`. When blocked, the hook shows
//      a pixel-themed `showConfirm` modal asking "Discard unsaved
//      changes?" — pick "Discard and leave" (blocker.proceed()) or
//      "Keep editing" (blocker.reset()). The modal's content is fully
//      under our control, unlike the browser's beforeunload dialog.
//
// React Router v7 supports `useBlocker` in declarative mode (with
// <BrowserRouter>) — this is a v7 capability the v6 version of the
// hook didn't have. Pre-v7 this was a "deferred scope" gap noted on
// every Edit page comment; v0.2.2 closed it.
//
// Fires only while `dirty === true`. Pass `useExternalChange`'s
// returned dirty value (or any other boolean) in.

export function useUnsavedWarning(dirty: boolean): void {
  // beforeunload — covers window close, refresh, AppImage quit.
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

  // In-app navigation — block any nav that would change the path
  // while dirty. The function is invoked on every navigation; reads
  // `dirty` from closure so each render's value is what gets checked.
  // Same-path navigation (e.g. search-param tweaks on the same page)
  // is NOT blocked — only true location changes.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // When the blocker fires, show a confirm modal. The promise resolves
  // with the user's choice (true = discard and leave; false = keep
  // editing or Escape-dismissed).
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let cancelled = false;
    showConfirm({
      title: "Discard unsaved changes?",
      message:
        "You have unsaved edits on this page. Leaving without saving will discard them.",
      confirmLabel: "Discard and leave",
      cancelLabel: "Keep editing",
      danger: true,
    }).then((ok) => {
      if (cancelled) return;
      if (ok) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      // If the component unmounts (or dirty flips before the user
      // answers — e.g. a successful save while the modal is open),
      // reset the blocker so it doesn't sit in "blocked" limbo and
      // swallow subsequent navigations.
      cancelled = true;
      if (blocker.state === "blocked") blocker.reset();
    };
  }, [blocker]);
}
