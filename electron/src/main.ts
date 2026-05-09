// Bleepforge Electron main process.
//
// Architecture: the React app is unchanged — it's served by Vite in dev
// (with /api proxied to the existing Express on :4000) and by the built
// static bundle in prod. Electron's only job is opening Chromium windows
// pointing at the right URL. No Node access in the renderer; the renderer
// talks to Express over HTTP exactly like the browser version.
//
// Two window flavors:
//   - Main window: maximized on launch, full app shell (header + footer +
//     all routes). One per session.
//   - Popouts: chromeless secondary windows for Diagnostics, Help, and
//     Preferences. The renderer hides the app header / footer when
//     ?popout=1 is present in the URL. One per route path; clicking the
//     icon while a popout is open just focuses it.
//
// The OS menu is removed entirely (Menu.setApplicationMenu(null)) so all
// windows show only the WM's native title bar / close-min-max controls.

import { BrowserWindow, Menu, app, ipcMain, shell } from "electron";
import path from "node:path";

// Quiet the harmless DevTools-internal "Autofill.enable / Autofill.setAddresses
// wasn't found" stderr noise: Chromium 130's DevTools probes Autofill CDP
// methods that Electron doesn't implement. Disabling the underlying features
// stops the probe; nothing in Bleepforge uses Autofill (we're a local
// authoring tool with no form-fill needs).
app.commandLine.appendSwitch(
  "disable-features",
  "Autofill,AutofillServerCommunication",
);

const isDev = process.env.BLEEPFORGE_ELECTRON_DEV === "1";
const devUrl = process.env.VITE_DEV_URL ?? "http://localhost:5173";

const popouts = new Map<string, BrowserWindow>();

// Per-route popout sizes. Numbers are eyeballed to fit each surface's
// natural content extent; the user can resize freely from there.
const POPOUT_SIZES: Record<string, { width: number; height: number }> = {
  "/diagnostics": { width: 1100, height: 750 },
  "/help": { width: 1100, height: 800 },
  "/preferences": { width: 720, height: 800 },
};
const POPOUT_DEFAULT = { width: 900, height: 700 };

function popoutSize(routePath: string): { width: number; height: number } {
  for (const [prefix, size] of Object.entries(POPOUT_SIZES)) {
    if (routePath === prefix || routePath.startsWith(prefix + "/")) {
      return size;
    }
  }
  return POPOUT_DEFAULT;
}

function popoutTitle(routePath: string): string {
  if (routePath.startsWith("/diagnostics")) return "Bleepforge — Diagnostics";
  if (routePath.startsWith("/help")) return "Bleepforge — Help";
  if (routePath.startsWith("/preferences")) return "Bleepforge — Preferences";
  return "Bleepforge";
}

function makeWebPreferences() {
  return {
    preload: path.join(__dirname, "preload.js"),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
  };
}

function attachOpenHandler(win: BrowserWindow): void {
  // target=_blank links go to the system browser, not a child Electron
  // window. Anything else stays in-window via React Router.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "Bleepforge",
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    webPreferences: makeWebPreferences(),
  });
  // Belt-and-braces: Menu.setApplicationMenu(null) at app.whenReady is
  // supposed to suppress the menu globally, but Electron will sometimes
  // still attach a default menu to a fresh BrowserWindow. removeMenu()
  // strips it from this window specifically; combined with
  // autoHideMenuBar: true, Alt-revealing the menu also returns nothing.
  win.removeMenu();
  attachOpenHandler(win);

  if (isDev) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Prod path stub — Phase 2 (packaging) will replace this with a
    // proper packaged-app loader.
    const indexHtml = path.join(__dirname, "..", "..", "client", "dist", "index.html");
    win.loadFile(indexHtml);
  }

  // Maximize rather than literal fullscreen — keeps the title bar / close
  // controls visible and Alt+Tab behavior normal across WMs. F11 / the
  // window's maximize control still toggle fullscreen if the user wants.
  win.maximize();

  // Close every open popout when the main window closes. Popouts are
  // children-of-main conceptually (they were spawned from main and can't
  // be reopened from anywhere else), so leaving them as orphan windows
  // would just stall the app's quit and confuse the user. We listen on
  // `close` (not `closed`) so popout teardown happens before the main
  // window's own teardown — the existing `window-all-closed` handler
  // then quits the app cleanly on non-darwin platforms.
  win.on("close", () => {
    for (const popout of popouts.values()) {
      if (!popout.isDestroyed()) popout.close();
    }
    popouts.clear();
  });

  return win;
}

function openPopout(routePath: string): void {
  const existing = popouts.get(routePath);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }

  const size = popoutSize(routePath);
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 480,
    minHeight: 400,
    title: popoutTitle(routePath),
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    webPreferences: makeWebPreferences(),
  });
  win.removeMenu();
  attachOpenHandler(win);

  if (isDev) {
    win.loadURL(`${devUrl}${routePath}?popout=1`);
    // Popouts default to no DevTools — set BLEEPFORGE_POPOUT_DEVTOOLS=1
    // to opt in. The main window's DevTools are usually enough for
    // renderer-side debugging since both windows share the same code.
    if (process.env.BLEEPFORGE_POPOUT_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    // Prod popouts share the prod stub's limitations — revisited in Phase 2.
    const indexHtml = path.join(__dirname, "..", "..", "client", "dist", "index.html");
    win.loadFile(indexHtml, { search: "popout=1", hash: routePath });
  }

  popouts.set(routePath, win);
  win.on("closed", () => {
    popouts.delete(routePath);
  });
}

app.whenReady().then(() => {
  // Strip the application menu globally — every window then shows only
  // the WM's native close/min/max controls. Per-window removeMenu() also
  // works but this is simpler and applies to popouts created later.
  Menu.setApplicationMenu(null);

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

ipcMain.handle("popout:open", (_event, routePath: unknown) => {
  if (typeof routePath !== "string" || !routePath.startsWith("/")) return;
  openPopout(routePath);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
