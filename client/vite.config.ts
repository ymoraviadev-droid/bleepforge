import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";

// Source of truth for the app version is electron/package.json — that's
// the file that ends up packaged inside app.asar and read by Electron's
// `app.getVersion()`. Mirror it into the renderer via a Vite `define` so
// the splash + document.title stay in lockstep with the main process.
const electronPkg = JSON.parse(
  fs.readFileSync(new URL("../electron/package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(electronPkg.version),
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
