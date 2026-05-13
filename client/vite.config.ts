import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";

// Source of truth for the app version is electron/package.json — that's
// the file that ends up packaged inside app.asar and read by Electron's
// `app.getVersion()`. Mirror it into the renderer via a Vite `define` so
// the splash + document.title stay in lockstep with the main process.
//
// `lastStable` is a custom field on electron/package.json (v0.2.2): it
// records the last released stable version so a `-dev` build can show
// "this is dev work, last stable was vX" without needing a second
// source of truth. Bump lastStable only when cutting a stable release.
const electronPkg = JSON.parse(
  fs.readFileSync(new URL("../electron/package.json", import.meta.url), "utf8"),
) as { version: string; lastStable?: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(electronPkg.version),
    __LAST_STABLE_VERSION__: JSON.stringify(electronPkg.lastStable ?? ""),
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: false,
        // SSE: keep the connection open + don't buffer.
        // (selfHandleResponse must stay false so http-proxy streams events.)
        ws: false,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            // Strip any compression/proxy buffering headers the server didn't
            // already set. The server already sends X-Accel-Buffering: no
            // and Cache-Control: no-cache, no-transform.
            proxyRes.headers["cache-control"] = "no-cache, no-transform";
          });
        },
      },
    },
  },
});
