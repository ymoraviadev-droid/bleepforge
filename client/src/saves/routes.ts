// Maps a save event's (domain, key, action) to the route the user lands on
// when they click the row. Same shape as sync/syncToasts.ts's mapping —
// kept separate so the two contexts can drift independently if needed
// (e.g. saves might want to deep-link to a specific tab inside the edit
// page later, where toasts wouldn't).
//
// "updated" → entity edit page; "deleted" → list/graph page (the entity
// is gone, so 404'ing the edit route would be hostile).

import type { SaveAction, SaveDomain } from "../lib/api";

interface DomainRoute {
  label: string;
  updated: (key: string) => string;
  deleted: (key: string) => string;
}

const DOMAIN: Record<SaveDomain, DomainRoute> = {
  item: {
    label: "Item",
    updated: (key) => `/items/${encodeURIComponent(key)}`,
    deleted: () => "/items",
  },
  quest: {
    label: "Quest",
    updated: (key) => `/quests/${encodeURIComponent(key)}`,
    deleted: () => "/quests",
  },
  npc: {
    label: "NPC",
    updated: (key) => `/npcs/${encodeURIComponent(key)}`,
    deleted: () => "/npcs",
  },
  karma: {
    label: "Karma impact",
    updated: (key) => `/karma/${encodeURIComponent(key)}`,
    deleted: () => "/karma",
  },
  faction: {
    label: "Faction",
    updated: (key) => `/factions/${encodeURIComponent(key)}`,
    deleted: () => "/factions",
  },
  dialog: {
    label: "Dialog",
    // Key is "<folder>/<id>" — split on the first slash so an id
    // containing slashes (none currently, but defensive) doesn't break.
    updated: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/dialogs";
      const folder = key.slice(0, slash);
      const id = key.slice(slash + 1);
      return `/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
    },
    deleted: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/dialogs";
      const folder = key.slice(0, slash);
      // Graph view reads ?folder= — drop the user on the canvas where the
      // removed sequence is now visibly gone.
      return `/dialogs?folder=${encodeURIComponent(folder)}`;
    },
  },
  balloon: {
    label: "Balloon",
    updated: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/balloons";
      const folder = key.slice(0, slash);
      const id = key.slice(slash + 1);
      return `/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
    },
    deleted: () => "/balloons",
  },
};

export function routeForSave(
  domain: SaveDomain,
  key: string,
  action: SaveAction,
): string {
  const route = DOMAIN[domain];
  return action === "updated" ? route.updated(key) : route.deleted(key);
}

export function labelForDomain(domain: SaveDomain): string {
  return DOMAIN[domain].label;
}

/** For dialog keys, render "folder / id" with breathing room; otherwise the
 *  key as-is. Used in row body so the eye can scan domain + slug fast. */
export function displayKey(domain: SaveDomain, key: string): string {
  if (domain !== "dialog") return key;
  const slash = key.indexOf("/");
  if (slash < 0) return key;
  return `${key.slice(0, slash)} / ${key.slice(slash + 1)}`;
}
