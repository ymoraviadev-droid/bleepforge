// Bleepforge preload script.
//
// Runs once per renderer with full Node access, but is the ONLY surface
// that touches Node — everything we expose to the renderer goes through
// contextBridge so the renderer itself stays sandboxed (sandbox: true,
// contextIsolation: true, nodeIntegration: false).
//
// Today the only bridge is `popout(path)`: a thin invoke wrapper around
// the main process's "popout:open" IPC handler. The renderer treats
// `window.bleepforge?.popout` as the "we're running in Electron" marker
// and falls back to plain navigation when it's absent (browser mode).

import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  popout: (routePath: string): Promise<void> =>
    ipcRenderer.invoke("popout:open", routePath),
};

contextBridge.exposeInMainWorld("bleepforge", bridge);
