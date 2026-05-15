// Bleepforge server CLI entry. Used by the dev workflow (`tsx watch`) and
// the legacy `node dist/index.js` start script. The packaged app boots via
// Electron main calling startServer() directly — see electron/src/main.ts.
//
// Log capture must come FIRST (monkey-patches console.* so Diagnostics →
// Logs sees boot lines). The actual app composition lives in app.ts so it
// can be imported without side-effects.

import "./lib/logs/buffer.js";
import { config } from "./config.js";
import { startServer } from "./app.js";

// CLI fail-fast: when launched from a terminal, refuse to start when
// there's no useful path to work against — either a sync-mode project
// missing its Godot root, or no project at all + no env-var bootstrap.
// Notebook projects boot fine without a Godot root by design; they own
// their own content under projects/<slug>/content/. Electron main
// bypasses this entry and calls startServer() directly so the packaged
// app can limp into the welcome flow.
const needsGodotRoot =
  config.activeProjectSlug === null || config.projectMode === "sync";
if (needsGodotRoot && !config.godotProjectRoot) {
  console.error("[bleepforge/server] No Godot project root configured.");
  console.error(
    "[bleepforge/server] Set GODOT_PROJECT_ROOT in .env, or open Preferences",
  );
  console.error(
    "[bleepforge/server] in a previous run to point at your project.",
  );
  process.exit(1);
}

startServer().catch((err) => {
  console.error(`[bleepforge/server] failed to start:`, err);
  process.exit(1);
});
