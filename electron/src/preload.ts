// Bleepforge preload script.
//
// Runs once per renderer with full Node access, but is the ONLY surface
// that touches Node — everything we expose to the renderer goes through
// contextBridge so the renderer itself stays sandboxed (sandbox: true,
// contextIsolation: true, nodeIntegration: false).
//
// Bridges exposed today:
//   - `popout(path)`: a thin invoke wrapper around the main process's
//     "popout:open" IPC handler. The renderer treats
//     `window.bleepforge?.popout` as the "we're running in Electron"
//     marker and falls back to plain navigation when it's absent
//     (browser mode).
//   - `restart()`: relaunch the app (`app.relaunch() + app.exit()`).
//     Triggered from the header's restart icon when the user changes a
//     boot-captured config (project root, future folder overrides).
//   - `reveal()`: flip the splash-sized main window into a maximized
//     real app window. Called by the SplashScreen on CONTINUE click,
//     in parallel with the splash fade-out animation.
//   - `onUpdaterStatus(cb)` / `installUpdate()`: auto-update wiring.
//     Main process emits "updater:status" events on every electron-updater
//     callback (checking / available / downloaded / error / progress);
//     the renderer subscribes via onUpdaterStatus and renders toasts.
//     installUpdate triggers `quitAndInstall()` which closes the app,
//     runs the installer, and relaunches the new version.

import { contextBridge, ipcRenderer } from "electron";

type UpdaterStatus =
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available"; version: string }
  | { kind: "download-progress"; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

const bridge = {
  popout: (routePath: string): Promise<void> =>
    ipcRenderer.invoke("popout:open", routePath),
  restart: (): Promise<void> => ipcRenderer.invoke("app:restart"),
  reveal: (): Promise<void> => ipcRenderer.invoke("app:reveal"),
  pickGodotFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pick-godot-folder"),
  // Returns an unsubscribe function the caller MUST invoke on cleanup —
  // ipcRenderer.on accumulates listeners forever otherwise. The closure
  // captures `handler` so removeListener gets the exact reference it
  // registered, not a re-bound one.
  onUpdaterStatus: (callback: (status: UpdaterStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: UpdaterStatus) =>
      callback(payload);
    ipcRenderer.on("updater:status", handler);
    return () => {
      ipcRenderer.removeListener("updater:status", handler);
    };
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke("updater:install"),
};

contextBridge.exposeInMainWorld("bleepforge", bridge);
