// Live-asset client. In the **main window** opens a single SSE connection
// to /api/assets/events at app startup and re-dispatches each event as a
// window-level "Bleepforge:asset" CustomEvent. In **popout** windows NO
// SSE is opened — popouts subscribe to a same-origin BroadcastChannel
// that the main window relays each received event onto. See
// sync/stream.ts for the connection-limit reasoning.
//
// Why a second channel from sync: asset events have different consumers
// (the gallery only) and a different shape from SyncEvent. Folding them
// into the existing stream would mean adding a discriminator on every
// sync listener — cheaper to keep the channels apart.

import { isPopout } from "../electron";

export interface AssetEvent {
  kind: "added" | "changed" | "removed";
  path: string;
}

declare global {
  interface WindowEventMap {
    "Bleepforge:asset": CustomEvent<AssetEvent>;
  }
}

const RELAY_NAME = "bleepforge:assets-relay";
let relay: BroadcastChannel | null = null;

function getRelay(): BroadcastChannel | null {
  if (relay) return relay;
  if (typeof BroadcastChannel === "undefined") return null;
  relay = new BroadcastChannel(RELAY_NAME);
  return relay;
}

let started = false;
let source: EventSource | null = null;

export function startAssetStream(): void {
  if (started) return;
  started = true;

  if (isPopout()) {
    getRelay()?.addEventListener("message", (e) => {
      window.dispatchEvent(
        new CustomEvent("Bleepforge:asset", { detail: e.data as AssetEvent }),
      );
    });
    return;
  }

  connect();
}

function connect(): void {
  source = new EventSource("/api/assets/events");
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as AssetEvent;
      window.dispatchEvent(new CustomEvent("Bleepforge:asset", { detail: data }));
      getRelay()?.postMessage(data);
    } catch (err) {
      console.warn("[assets] bad event payload:", err);
    }
  };
  source.onerror = () => {
    if (source && source.readyState === EventSource.CLOSED) {
      console.warn("[assets] connection closed; will retry");
    }
  };
}
