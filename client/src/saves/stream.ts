// Live save-activity client. Opens a single SSE connection to
// /api/saves/events at app startup and re-dispatches each event as a
// window-level "Bleepforge:save" CustomEvent. The SavesTab subscribes
// to that event and prepends each new entry to its visible list — same
// shape as sync/stream.ts, separate channel.
//
// EventSource auto-reconnects on network blips with no extra code.

import type { SaveEntry } from "../api";

declare global {
  interface WindowEventMap {
    "Bleepforge:save": CustomEvent<SaveEntry>;
  }
}

let started = false;
let source: EventSource | null = null;

export function startSavesStream(): void {
  if (started) return;
  started = true;
  connect();
}

function connect(): void {
  source = new EventSource("/api/saves/events");
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as SaveEntry;
      window.dispatchEvent(
        new CustomEvent("Bleepforge:save", { detail: data }),
      );
    } catch (err) {
      console.warn("[saves] bad event payload:", err);
    }
  };
  source.onerror = () => {
    if (source && source.readyState === EventSource.CLOSED) {
      console.warn("[saves] connection closed; will retry");
    }
  };
}
