// HTTP surface for the save-activity feed:
//   - GET  /api/saves        → snapshot of the ring buffer (newest-first)
//   - POST /api/saves/clear  → wipe the buffer
//   - GET  /api/saves/events → SSE stream of new save events (live updates)
//
// SSE shape mirrors /api/sync/events for consistency. The client opens one
// EventSource at app startup; the SavesTab subscribes via a window
// CustomEvent and prepends each new entry to its visible list.

import { Router } from "express";
import { clearSaves, listSaves } from "./buffer.js";
import { subscribeSaveEvents } from "./eventBus.js";

export const savesRouter: Router = Router();

savesRouter.get("/", (_req, res) => {
  res.json(listSaves());
});

savesRouter.post("/clear", (_req, res) => {
  clearSaves();
  res.json({ ok: true });
});

savesRouter.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Heartbeat comment every 25s so intermediaries don't kill idle connections.
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25_000);

  const unsubscribe = subscribeSaveEvents((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });

  res.write(": connected\n\n");
});
