import type { SaveDomain } from "../api";

// Per-domain display label + route resolver. Used by both the incoming
// sync toasts (useSyncToasts — Godot → Bleepforge) and the outgoing
// save toasts (useOutgoingSaveToasts — Bleepforge → disk). Keeping the
// map here (not duplicated per hook) means a new domain or a route
// change lands in one place.
//
// `updatedRoute` is where the user goes to verify / continue editing —
// the entity's edit page. `deletedRoute` is the list/graph page (the
// entity is gone, so a 404 would be unhelpful).

export interface DomainInfo {
  label: string;
  updatedRoute: (key: string) => string;
  deletedRoute: (key: string) => string;
}

export const DOMAIN_LABELS: Record<SaveDomain, DomainInfo> = {
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
    // key is "<folder>/<id>" — split on the first slash so an id
    // containing slashes (none currently, but defensive) doesn't
    // break the route.
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
      // Graph view reads ?folder= — link there so the user lands on
      // the right canvas with the now-removed sequence visibly gone.
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
  shader: {
    label: "Shader",
    // The shader edit page reads `?path=` for the .gdshader's absolute
    // path; saves stream's `key` IS that absolute path.
    updatedRoute: (key) => `/shaders/edit?path=${encodeURIComponent(key)}`,
    deletedRoute: () => "/shaders",
  },
};

// Display body for a toast. Dialog + balloon keys get rendered as
// "folder / id" with a visible separator for readability; everything
// else uses the key verbatim. Shader keys are file paths; show just
// the basename to keep the toast narrow.
export function toToastBody(domain: SaveDomain, key: string): string {
  if (domain === "dialog" || domain === "balloon") {
    const slash = key.indexOf("/");
    if (slash < 0) return key;
    return `${key.slice(0, slash)} / ${key.slice(slash + 1)}`;
  }
  if (domain === "shader") {
    const slash = key.lastIndexOf("/");
    return slash < 0 ? key : key.slice(slash + 1);
  }
  return key;
}
