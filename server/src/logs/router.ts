// One-shot fetch of the in-memory log buffer. Used by the Logs tab in
// the Diagnostics page. No streaming endpoint yet — the v1 trade is "click
// refresh / revisit the tab to see new entries" rather than the engineering
// cost of SSE + a virtualized live feed. See server/src/logs/buffer.ts.

import { Router } from "express";
import { listLogs } from "./buffer.js";

export const logsRouter: Router = Router();

logsRouter.get("/", (_req, res) => {
  res.json(listLogs());
});
