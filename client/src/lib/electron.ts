import type { MouseEvent } from "react";

// Renderer-side bridge to Electron, when present.
//
// In the desktop app, the preload script (electron/src/preload.ts) calls
// contextBridge.exposeInMainWorld("bleepforge", { popout }), so this
// object exists on window. In the browser, it doesn't — falling through
// to plain navigation. `isElectron()` is the truthy check; `isPopout()`
// reads the URL once at module load so it stays sticky across in-window
// React Router navigations (a Link to /help/foo from inside a Help
// popout drops the ?popout=1 query, but we still want to keep the
// chromeless layout for that window's lifetime).

export type BleepforgeBridge = {
  popout: (routePath: string) => Promise<void>;
};

declare global {
  interface Window {
    bleepforge?: BleepforgeBridge;
  }
}

const POPOUT_FLAG: boolean = (() => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("popout") === "1";
})();

export function isPopout(): boolean {
  return POPOUT_FLAG;
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.bleepforge;
}

// Click handler for header icons that should pop out instead of navigate
// when running in Electron. Pass the React mouse event + target route;
// the handler preventDefault's and triggers the IPC if Electron is
// present, otherwise lets the wrapping <NavLink> navigate normally.
export function popoutOrNavigate(
  e: MouseEvent,
  routePath: string,
): void {
  const bf = typeof window !== "undefined" ? window.bleepforge : undefined;
  if (bf && !POPOUT_FLAG) {
    e.preventDefault();
    bf.popout(routePath);
  }
}
