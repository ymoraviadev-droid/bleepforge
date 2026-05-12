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

import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  popout: (routePath: string): Promise<void> =>
    ipcRenderer.invoke("popout:open", routePath),
  restart: (): Promise<void> => ipcRenderer.invoke("app:restart"),
};

contextBridge.exposeInMainWorld("bleepforge", bridge);
