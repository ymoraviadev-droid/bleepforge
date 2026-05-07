import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
