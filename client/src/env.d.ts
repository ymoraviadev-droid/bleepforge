// Globals injected by Vite via `define` in vite.config.ts.
//
// __APP_VERSION__ — the app version, sourced at build time from
// electron/package.json (the file that ends up packaged inside app.asar
// and read by Electron's `app.getVersion()`).
//
// __LAST_STABLE_VERSION__ — the last released stable version, sourced
// from electron/package.json's custom `lastStable` field. Empty string
// if not set. The sidebar uses this in its tooltip when the current
// version carries a `-dev` (or other pre-release) suffix.

declare const __APP_VERSION__: string;
declare const __LAST_STABLE_VERSION__: string;
