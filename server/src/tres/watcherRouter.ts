// Read-only status snapshot for the Diagnostics → Watcher tab. Reports
// whether the chokidar watcher is alive, what root it's pointing at, the
// .tres file count it's tracking, and the last ~100 events with their
// outcomes (reimported / deleted / ignored / failed). The Logs tab is the
// canonical history; this is the focused per-tab view.

import { Router } from "express";
import { watcherStatus } from "./watcher.js";

export const watcherRouter: Router = Router();

watcherRouter.get("/", (_req, res) => {
  res.json(watcherStatus());
});
