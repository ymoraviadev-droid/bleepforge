// Library entry point for the esbuild bundle. The CLI entry (index.ts)
// calls startServer() at module load — that's wrong for the packaged path
// where Electron's main process wants to await startServer() itself. This
// file does the two things index.ts does *before* calling startServer
// (install the log capture monkey-patch, then re-export the composer) and
// nothing else.

import "./lib/logs/buffer.js";
export { startServer } from "./app.js";
