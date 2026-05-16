// Maps a save event's (domain, key, action) to the route the user lands on
// when they click the row. Same shape as sync/syncToasts.ts's mapping —
// kept separate so the two contexts can drift independently if needed
// (e.g. saves might want to deep-link to a specific tab inside the edit
// page later, where toasts wouldn't).
//
// "updated" → entity edit page; "deleted" → list/graph page (the entity
// is gone, so 404'ing the edit route would be hostile).

import type { SaveAction, SaveDomain } from "../api";

// Domain accepts any string — SaveDomain literals + manifest-discovered
// domain names. The Record below remains exhaustive for the SaveDomain
// literals (via `satisfies`); unknown names fall through to a manifest
// route + raw-name label.

interface DomainRoute {
  label: string;
  // The optional `path` arg carries SaveEvent.path (absolute filesystem
  // path). Most domains route by key alone, but shader edits live at
  // /shaders/edit?path=<abs> so they need the real path — the relative
  // key is human-readable but doesn't reconstruct without the project
  // root, which the client doesn't know.
  updated: (key: string, path?: string) => string;
  deleted: (key: string) => string;
}

const DOMAIN = {
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
  shader: {
    label: "Shader",
    // Use the absolute path from SaveEvent.path when present (the server
    // populates it for every shader save). Fallback to the key landing
    // on the list page is a defensive last resort — shouldn't happen in
    // practice, but stays useful instead of a 404 if it does.
    updated: (_key, path) =>
      path ? `/shaders/edit?path=${encodeURIComponent(path)}` : "/shaders",
    deleted: () => "/shaders",
  },
  // Bleepforge-only domains (v0.2.2) — no .tres counterpart but the
  // manual Save button records into the saves stream so they show up
  // in this audit feed too.
  concept: {
    label: "Game concept",
    updated: () => "/concept",
    deleted: () => "/concept",
  },
  "codex-entry": {
    label: "Codex entry",
    // key is "<category>/<id>" — same split as dialog/balloon.
    updated: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/codex";
      const category = key.slice(0, slash);
      const id = key.slice(slash + 1);
      return `/codex/${encodeURIComponent(category)}/${encodeURIComponent(id)}`;
    },
    deleted: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/codex";
      const category = key.slice(0, slash);
      return `/codex?category=${encodeURIComponent(category)}`;
    },
  },
  "codex-category": {
    label: "Codex category",
    updated: (key) => `/codex/${encodeURIComponent(key)}/_meta`,
    deleted: () => "/codex",
  },
} satisfies Record<SaveDomain, DomainRoute>;

// Lookup helper that accepts any string. Returns undefined for
// manifest-discovered domains so callers can fall back to manifest-
// generic behavior (route to /manifest/<domain>, label = raw name).
function lookup(domain: string): DomainRoute | undefined {
  return (DOMAIN as Record<string, DomainRoute>)[domain];
}

export function routeForSave(
  domain: string,
  key: string,
  action: SaveAction,
  path?: string,
): string {
  const route = lookup(domain);
  if (!route) {
    // Manifest-discovered domain — no per-entity edit page yet (v0.2.9);
    // route both updated + deleted to the domain list.
    return `/manifest/${encodeURIComponent(domain)}`;
  }
  return action === "updated" ? route.updated(key, path) : route.deleted(key);
}

export function labelForDomain(domain: string): string {
  return lookup(domain)?.label ?? domain;
}

/** For composite-key domains (dialog, balloon, codex-entry, manifest
 *  foldered), render "folder / id" with breathing room. The manifest
 *  branch can't know the entry kind from the client side, so use a
 *  heuristic: composite key contains a slash. */
export function displayKey(domain: string, key: string): string {
  const known =
    domain === "dialog" || domain === "balloon" || domain === "codex-entry";
  const slash = key.indexOf("/");
  if (slash < 0) return key;
  // For known composite-key domains always split; for unknown domains
  // split only when a slash is present (no false positives on plain ids).
  if (known) {
    return `${key.slice(0, slash)} / ${key.slice(slash + 1)}`;
  }
  return key;
}
