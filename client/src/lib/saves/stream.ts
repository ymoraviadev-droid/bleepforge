// Live save-activity client. In the **main window** opens a single SSE
// connection to /api/saves/events at app startup and re-dispatches each
// event as a window-level "Bleepforge:save" CustomEvent. In **popout**
// windows NO SSE is opened — popouts subscribe to a same-origin
// BroadcastChannel that the main window relays each received event onto.
// See sync/stream.ts for the connection-limit reasoning.
//
// The SavesTab subscribes to "Bleepforge:save" the same way in either
// window — the dispatching is identical from a component's perspective.
// EventSource auto-reconnects on network blips with no extra code.

import type { SaveEntry } from "../api";
import { isPopout } from "../electron";

declare global {
  interface WindowEventMap {
    "Bleepforge:save": CustomEvent<SaveEntry>;
  }
}

const RELAY_NAME = "bleepforge:saves-relay";
let relay: BroadcastChannel | null = null;

function getRelay(): BroadcastChannel | null {
  if (relay) return relay;
  if (typeof BroadcastChannel === "undefined") return null;
  relay = new BroadcastChannel(RELAY_NAME);
  return relay;
}

let started = false;
let source: EventSource | null = null;

export function startSavesStream(): void {
  if (started) return;
  started = true;

  if (isPopout()) {
    getRelay()?.addEventListener("message", (e) => {
      window.dispatchEvent(
        new CustomEvent("Bleepforge:save", { detail: e.data as SaveEntry }),
      );
    });
    return;
  }

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
      getRelay()?.postMessage(data);
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

// Explicit teardown — see closeSyncStream in sync/stream.ts.
export function closeSavesStream(): void {
  if (source) {
    source.close();
    source = null;
  }
  if (relay) {
    relay.close();
    relay = null;
  }
  started = false;
}
