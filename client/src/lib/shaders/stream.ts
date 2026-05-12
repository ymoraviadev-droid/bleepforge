// Live shader-event client. Same shape as lib/assets/stream.ts: the main
// window opens one EventSource against /api/shaders/events and re-dispatches
// each event as a window-level "Bleepforge:shader" CustomEvent; popouts
// subscribe to a same-origin BroadcastChannel relay that main forwards
// each event onto, dodging the 6-per-origin HTTP connection cap.
//
// Why a fourth channel rather than folding into assets: shader events
// have different consumers (the shader gallery + edit page) and a
// different event shape. Folding would mean a discriminator branch on
// every asset listener — cheaper to keep them apart while we have headroom
// on the connection budget (main holds at most 4 channels, well under 6).

import { isPopout } from "../electron";

export interface ShaderEvent {
  kind: "added" | "changed" | "removed";
  path: string;
}

declare global {
  interface WindowEventMap {
    "Bleepforge:shader": CustomEvent<ShaderEvent>;
  }
}

const RELAY_NAME = "bleepforge:shaders-relay";
let relay: BroadcastChannel | null = null;

function getRelay(): BroadcastChannel | null {
  if (relay) return relay;
  if (typeof BroadcastChannel === "undefined") return null;
  relay = new BroadcastChannel(RELAY_NAME);
  return relay;
}

let started = false;
let source: EventSource | null = null;

export function startShaderStream(): void {
  if (started) return;
  started = true;

  if (isPopout()) {
    getRelay()?.addEventListener("message", (e) => {
      window.dispatchEvent(
        new CustomEvent("Bleepforge:shader", { detail: e.data as ShaderEvent }),
      );
    });
    return;
  }

  connect();
}

function connect(): void {
  source = new EventSource("/api/shaders/events");
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as ShaderEvent;
      window.dispatchEvent(new CustomEvent("Bleepforge:shader", { detail: data }));
      getRelay()?.postMessage(data);
    } catch (err) {
      console.warn("[shaders] bad event payload:", err);
    }
  };
  source.onerror = () => {
    if (source && source.readyState === EventSource.CLOSED) {
      console.warn("[shaders] connection closed; will retry");
    }
  };
}

// Explicit teardown for the Linux renderer-shutdown SIGTRAP fix —
// see closeSyncStream in sync/stream.ts.
export function closeShaderStream(): void {
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
