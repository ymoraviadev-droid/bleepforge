// Bleepforge Electron main process.
//
// Architecture: the React app is unchanged — it's served by Vite in dev
// (with /api proxied to the existing Express on :4000) and by the bundled
// Express in prod (which serves both the API and the built client). The
// renderer talks to Express over HTTP exactly like the browser version.
//
// Dev vs prod boot:
//   - Dev: a separate `pnpm dev` process is already running the server +
//     vite. Electron just opens a window pointing at the vite URL.
//   - Prod: Electron main starts the server in-process via dynamic import
//     of the esbuild bundle (server/dist-bundle/server.mjs). The bundle
//     reads BLEEPFORGE_CLIENT_DIST + DATA_ROOT env vars set here. Window
//     loads the Express URL.
//
// Two window flavors:
//   - Main window: maximized on launch, full app shell. One per session.
//   - Popouts: chromeless secondary windows for Diagnostics / Help /
//     Preferences. The renderer hides the app header / footer when
//     ?popout=1 is present in the URL. One per route path.
//
// The OS menu is removed entirely (Menu.setApplicationMenu(null)) so all
// windows show only the WM's native title bar / close-min-max controls.

import { BrowserWindow, Menu, app, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Override the userData path's name to "Bleepforge". By default Electron
// derives this from package.json's `name` field (`@bleepforge/electron`),
// which sanitizes badly into ~/.config/@bleepforge/. setName() must be
// called BEFORE any `app.getPath("userData")` resolution — Electron caches
// the resolved path on first access.
app.setName("Bleepforge");

// Boot-trace log to a file in userData. Helpful when Electron's stdout
// isn't captured by the launching shell (common when GUI apps detach).
// Lives at <userData>/boot.log; appended each launch.
function bootLog(line: string): void {
  try {
    const dir = app.getPath("userData");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString();
    fs.appendFileSync(path.join(dir, "boot.log"), `${stamp} ${line}\n`);
  } catch {
    // best-effort
  }
}

// Quiet the harmless DevTools-internal "Autofill.enable / Autofill.setAddresses
// wasn't found" stderr noise: Chromium 130's DevTools probes Autofill CDP
// methods that Electron doesn't implement. Disabling the underlying features
// stops the probe; nothing in Bleepforge uses Autofill (we're a local
// authoring tool with no form-fill needs).
app.commandLine.appendSwitch(
  "disable-features",
  "Autofill,AutofillServerCommunication",
);

// Disable Chromium's setuid sandbox helper. The packaged binary's
// chrome-sandbox isn't setuid-root (electron-builder doesn't have root at
// build time), and on Linux distros where unprivileged user namespaces are
// disabled (Fedora, some Ubuntu policies) the sandbox can't bootstrap and
// the process segfaults during zygote startup. Bleepforge is a local
// single-user authoring tool that loads only its own renderer URL — the
// sandbox isn't a meaningful security boundary here. The renderer still
// runs with `sandbox: true` in webPreferences (V8 + IPC isolation), and
// `contextIsolation: true` blocks Node access from the page.
app.commandLine.appendSwitch("no-sandbox");

const isDev = process.env.BLEEPFORGE_ELECTRON_DEV === "1";
const devUrl = process.env.VITE_DEV_URL ?? "http://localhost:5173";

// Set in startServerInProcess() once the Express server is listening. The
// main window won't be created until this is non-null in prod mode.
let prodServerUrl: string | null = null;
function appUrl(): string {
  if (isDev) return devUrl;
  if (!prodServerUrl) {
    throw new Error("Server not started yet — refusing to open a window");
  }
  return prodServerUrl;
}

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
    // Renderer sandbox must match the global app.commandLine no-sandbox
    // switch we set above. With sandbox: true, BrowserWindow tries to
    // spawn a sandboxed renderer (--enable-sandbox) while the main
    // process is running with --no-sandbox; Chromium handles the
    // conflicting flags poorly on Linux and the renderer SIGTRAPs during
    // init. We still get V8/origin-isolation guarantees from
    // contextIsolation: true and nodeIntegration: false, which is the
    // security boundary that matters for a tool that only loads its own
    // localhost renderer URL.
    sandbox: false,
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

  win.loadURL(appUrl());
  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
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

  win.loadURL(`${appUrl()}${routePath}?popout=1`);
  if (isDev && process.env.BLEEPFORGE_POPOUT_DEVTOOLS === "1") {
    // Popouts default to no DevTools — set BLEEPFORGE_POPOUT_DEVTOOLS=1 to
    // opt in. The main window's DevTools are usually enough for renderer-
    // side debugging since both windows share the same code.
    win.webContents.openDevTools({ mode: "detach" });
  }

  popouts.set(routePath, win);
  win.on("closed", () => {
    popouts.delete(routePath);
  });
}

// In packaged mode, start the server in-process before opening any
// window. The bundle's startServer() configures Express, listens on a
// port, and returns its URL. We feed it BLEEPFORGE_CLIENT_DIST (the
// packaged client/dist path) and DATA_ROOT (a writable per-user path)
// via env BEFORE importing — server's config.ts reads them at module
// init.
async function startServerInProcess(): Promise<void> {
  // Path resolution: layout differs between packaged (inside app.asar)
  // and unpackaged (running `electron dist/main.js` from the workspace).
  //
  // Packaged (electron-builder's `files` config maps these into asar):
  //   <asar>/dist/main.js                    ← __dirname
  //   <asar>/server/dist-bundle/server.mjs   ← `../server/...`
  //   <asar>/client/dist/                    ← `../client/...`
  //
  // Unpackaged workspace:
  //   electron/dist/main.js                  ← __dirname
  //   server/dist-bundle/server.mjs          ← `../../server/...`
  //   client/dist/                           ← `../../client/...`
  const here = __dirname;
  const upToAppRoot = app.isPackaged
    ? path.join(here, "..")
    : path.join(here, "..", "..");
  const serverEntry = path.join(upToAppRoot, "server", "dist-bundle", "server.mjs");
  const clientDist = path.join(upToAppRoot, "client", "dist");

  // Writable user state lives outside asar in the per-user OS path. The
  // server's config.ts honors DATA_ROOT, so we just point it there. The
  // Bleepforge data dir is created on first write (jsonCrud / preferences
  // both `mkdir -p` before writing).
  const dataRoot = path.join(app.getPath("userData"), "data");
  process.env.DATA_ROOT = dataRoot;
  process.env.BLEEPFORGE_CLIENT_DIST = clientDist;
  // Seed root holds Bleepforge-only content (Help library) shipped inside
  // the asar. The server copies it into <dataRoot>/help/ on first launch
  // when the user's help dir is missing or empty. See `seedHelpLibrary`
  // in server/src/app.ts.
  process.env.BLEEPFORGE_SEED_ROOT = path.join(upToAppRoot, "seed");
  // Pick a free port at runtime so multiple Bleepforge instances (e.g.
  // packaged + dev) can coexist on the machine. Server reads PORT.
  process.env.PORT = "0";

  // Dynamic import — the server bundle is ESM and main.js is CJS. tsc
  // with module=commonjs would normally compile `await import(...)` to
  // `require(...)`, which can't load .mjs. The Function-constructor
  // wrapper hides the import() from tsc so it stays a real dynamic
  // import() in the emitted JS.
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<unknown>;
  const mod = (await dynamicImport(pathToFileURL(serverEntry).href)) as {
    startServer: () => Promise<{ url: string; port: number }>;
  };
  const started = await mod.startServer();
  prodServerUrl = started.url;
  console.log(`[bleepforge/electron] server up at ${started.url}`);
  console.log(`[bleepforge/electron] data root: ${dataRoot}`);
}

app.whenReady().then(async () => {
  bootLog(`whenReady fired (isDev=${isDev}, packaged=${app.isPackaged})`);
  // Strip the application menu globally — every window then shows only
  // the WM's native close/min/max controls. Per-window removeMenu() also
  // works but this is simpler and applies to popouts created later.
  Menu.setApplicationMenu(null);

  if (!isDev) {
    try {
      await startServerInProcess();
      bootLog(`server started, url=${prodServerUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      bootLog(`server FAILED: ${msg}`);
      console.error(`[bleepforge/electron] server failed to start:`, err);
      app.quit();
      return;
    }
  }

  try {
    createMainWindow();
    bootLog(`main window created`);
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    bootLog(`createMainWindow FAILED: ${msg}`);
    throw err;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

ipcMain.handle("popout:open", (_event, routePath: unknown) => {
  if (typeof routePath !== "string" || !routePath.startsWith("/")) return;
  openPopout(routePath);
});

// Restart the whole app. Used by the header's restart icon — needed when
// the user changes a config that's captured once at server boot (Godot
// project root today, future per-domain folder overrides). Equivalent to
// quitting and relaunching the AppImage by hand.
ipcMain.handle("app:restart", () => {
  app.relaunch();
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
