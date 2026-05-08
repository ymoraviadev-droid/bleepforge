// Server-Sent Events endpoint for live sync. One persistent HTTP connection
// per browser tab; server pushes JSON-encoded events as they arrive.
//
// Browser usage: `new EventSource("/api/sync/events")` → onmessage gets
// `event.data` as the JSON string.

import { Router } from "express";
import { subscribeSyncEvents } from "./eventBus.js";

export const syncRouter: Router = Router();

syncRouter.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering if proxied
  });
  res.flushHeaders();

  // Heartbeat comment every 25s so intermediaries don't kill idle connections.
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25_000);

  const unsubscribe = subscribeSyncEvents((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });

  // Send a "hello" comment so the client knows the stream is up.
  res.write(": connected\n\n");
});
