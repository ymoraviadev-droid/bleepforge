// Live-sync client. In the **main window** opens a single SSE connection
// to /api/sync/events at app startup and re-dispatches each event as a
// window-level "Bleepforge:sync" CustomEvent. In **popout** windows NO
// SSE is opened — popouts subscribe to a same-origin BroadcastChannel
// that the main window relays each received event onto.
//
// Why the relay: per-origin browser connection limit is 6 for HTTP/1.1.
// Main holds 3 SSEs already (sync + saves + assets). A popout opening
// its own three would push us to 6 and queue every other fetch on the
// origin — which made the Help / Diagnostics popouts hang on "Loading…"
// because their initial data fetch never got a connection slot.
//
// Listeners use the same `Bleepforge:sync` CustomEvent in either window;
// the dispatching is identical from a component's perspective.
// EventSource auto-reconnects on network blips with no extra code.

import { isPopout } from "../electron";

export type SyncDomain =
  | "item"
  | "karma"
  | "quest"
  | "dialog"
  | "npc"
  | "faction"
  | "balloon";

export interface SyncEvent {
  domain: SyncDomain;
  key: string; // for dialog: "<folder>/<id>"; otherwise the entity primary key
  action: "updated" | "deleted";
}

declare global {
  interface WindowEventMap {
    "Bleepforge:sync": CustomEvent<SyncEvent>;
  }
}

const RELAY_NAME = "bleepforge:sync-relay";
let relay: BroadcastChannel | null = null;

function getRelay(): BroadcastChannel | null {
  if (relay) return relay;
  if (typeof BroadcastChannel === "undefined") return null;
  relay = new BroadcastChannel(RELAY_NAME);
  return relay;
}

let started = false;
let source: EventSource | null = null;

export function startSyncStream(): void {
  if (started) return;
  started = true;

  if (isPopout()) {
    getRelay()?.addEventListener("message", (e) => {
      window.dispatchEvent(
        new CustomEvent("Bleepforge:sync", { detail: e.data as SyncEvent }),
      );
    });
    return;
  }

  connect();
}

function connect(): void {
  source = new EventSource("/api/sync/events");
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as SyncEvent;
      window.dispatchEvent(new CustomEvent("Bleepforge:sync", { detail: data }));
      getRelay()?.postMessage(data);
    } catch (err) {
      console.warn("[sync] bad event payload:", err);
    }
  };
  source.onerror = () => {
    if (source && source.readyState === EventSource.CLOSED) {
      console.warn("[sync] connection closed; will retry");
    }
  };
}
