// Live-asset client. Opens a single SSE connection to /api/assets/events
// at app startup and re-dispatches each event as a window-level
// CustomEvent on a separate channel from the game-domain sync stream.
//
// Why a second channel: asset events have different consumers (the
// gallery only) and a different shape from SyncEvent. Folding them into
// the existing stream would mean adding a discriminator on every sync
// listener — cheaper to keep the channels apart.

export interface AssetEvent {
  kind: "added" | "changed" | "removed";
  path: string;
}

declare global {
  interface WindowEventMap {
    "Bleepforge:asset": CustomEvent<AssetEvent>;
  }
}

let started = false;
let source: EventSource | null = null;

export function startAssetStream(): void {
  if (started) return;
  started = true;
  connect();
}

function connect(): void {
  source = new EventSource("/api/assets/events");
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as AssetEvent;
      window.dispatchEvent(new CustomEvent("Bleepforge:asset", { detail: data }));
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
