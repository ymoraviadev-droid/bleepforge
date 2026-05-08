// Live-sync client. Opens a single SSE connection to /api/sync/events at
// app startup and re-dispatches each event as a window-level CustomEvent.
//
// Components that want to react to changes from outside Bleepforge (e.g.
// Yonatan saving in Godot) listen for "Bleepforge:sync" on `window` and
// refetch their entity if the event's `domain`/`key` matches what they're
// showing.
//
// EventSource auto-reconnects on network blips with no extra code.

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

let started = false;
let source: EventSource | null = null;

export function startSyncStream(): void {
  if (started) return;
  started = true;
  connect();
}

function connect(): void {
  source = new EventSource("/api/sync/events");
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as SyncEvent;
      window.dispatchEvent(new CustomEvent("Bleepforge:sync", { detail: data }));
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
