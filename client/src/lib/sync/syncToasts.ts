import { useEffect } from "react";
import { pushToast } from "../../components/Toast";
import type { SyncDomain, SyncEvent } from "./stream";

// Maps every sync event coming off the SSE stream into a toast. Mounted once
// at App root via useSyncToasts(). The mapping is the only place that knows
// "domain X → label Y → click goes to route Z" — keeping it isolated means
// route changes don't leak into Toast.tsx, and Toast.tsx stays domain-agnostic
// in case other parts of the app want to push toasts later.

interface DomainInfo {
  label: string;
  // Updated → entity edit page; Deleted → list/graph page (entity is gone, so
  // we navigate to where the user can verify/recover, not a 404).
  updatedRoute: (key: string) => string;
  deletedRoute: (key: string) => string;
}

const DOMAIN: Record<SyncDomain, DomainInfo> = {
  item: {
    label: "Item",
    updatedRoute: (key) => `/items/${encodeURIComponent(key)}`,
    deletedRoute: () => "/items",
  },
  quest: {
    label: "Quest",
    updatedRoute: (key) => `/quests/${encodeURIComponent(key)}`,
    deletedRoute: () => "/quests",
  },
  npc: {
    label: "NPC",
    updatedRoute: (key) => `/npcs/${encodeURIComponent(key)}`,
    deletedRoute: () => "/npcs",
  },
  karma: {
    label: "Karma impact",
    updatedRoute: (key) => `/karma/${encodeURIComponent(key)}`,
    deletedRoute: () => "/karma",
  },
  faction: {
    label: "Faction",
    updatedRoute: (key) => `/factions/${encodeURIComponent(key)}`,
    deletedRoute: () => "/factions",
  },
  dialog: {
    label: "Dialog",
    // key is "<folder>/<id>" — split on the first slash so an id containing
    // slashes (none currently, but defensive) doesn't break the route.
    updatedRoute: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/dialogs";
      const folder = key.slice(0, slash);
      const id = key.slice(slash + 1);
      return `/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
    },
    deletedRoute: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/dialogs";
      const folder = key.slice(0, slash);
      // Graph view reads ?folder= — link there so the user lands on the
      // right canvas with the now-removed sequence visibly gone.
      return `/dialogs?folder=${encodeURIComponent(folder)}`;
    },
  },
  balloon: {
    label: "Balloon",
    // key is "<folder>/<id>" — same split rules as dialog.
    updatedRoute: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/balloons";
      const folder = key.slice(0, slash);
      const id = key.slice(slash + 1);
      return `/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
    },
    deletedRoute: () => "/balloons",
  },
};

function toToastBody(domain: SyncDomain, key: string): string {
  if (domain !== "dialog") return key;
  const slash = key.indexOf("/");
  if (slash < 0) return key;
  // Render dialog keys as "folder/id" with the folder slightly de-emphasized
  // by the surrounding context (toasts use a mono body font already).
  return `${key.slice(0, slash)} / ${key.slice(slash + 1)}`;
}

export function useSyncToasts(): void {
  useEffect(() => {
    const onSync = (e: CustomEvent<SyncEvent>) => {
      const { domain, key, action } = e.detail;
      const info = DOMAIN[domain];
      if (!info) return;
      const updated = action === "updated";
      pushToast({
        // Dedupe by domain+key so rapid re-saves of the same entity replace
        // the existing toast instead of stacking. Action is part of the id
        // so a delete-then-recreate sequence doesn't visually conflate them.
        id: `sync:${domain}:${key}:${action}`,
        title: `${info.label} ${updated ? "saved" : "deleted"}`,
        body: toToastBody(domain, key),
        to: updated ? info.updatedRoute(key) : info.deletedRoute(key),
        variant: updated ? "success" : "warn",
      });
    };
    window.addEventListener("Bleepforge:sync", onSync);
    return () => window.removeEventListener("Bleepforge:sync", onSync);
  }, []);
}
