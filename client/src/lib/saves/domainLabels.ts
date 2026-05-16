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

const DOMAIN_LABELS_NARROW = {
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
  concept: {
    label: "Game concept",
    // Singleton doc — the key is the literal "concept", the route is
    // always the same regardless.
    updatedRoute: () => "/concept",
    deletedRoute: () => "/concept",
  },
  "codex-entry": {
    label: "Codex entry",
    // key is "<category>/<id>" — split same as dialog/balloon.
    updatedRoute: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/codex";
      const category = key.slice(0, slash);
      const id = key.slice(slash + 1);
      return `/codex/${encodeURIComponent(category)}/${encodeURIComponent(id)}`;
    },
    deletedRoute: (key) => {
      const slash = key.indexOf("/");
      if (slash < 0) return "/codex";
      const category = key.slice(0, slash);
      return `/codex?category=${encodeURIComponent(category)}`;
    },
  },
  "codex-category": {
    label: "Codex category",
    updatedRoute: (key) =>
      `/codex/${encodeURIComponent(key)}/_meta`,
    deletedRoute: () => "/codex",
  },
} satisfies Record<SaveDomain, DomainInfo>;

// Index by any string for manifest-domain compatibility. The
// `satisfies` clause above keeps the exhaustiveness check for the
// hardcoded SaveDomain literals — drop one and tsc complains there,
// not here.
export const DOMAIN_LABELS: Readonly<Record<string, DomainInfo | undefined>> =
  DOMAIN_LABELS_NARROW;

// Display body for a toast. Dialog + balloon keys get rendered as
// "folder / id" with a visible separator for readability; everything
// else uses the key verbatim. Shader keys are file paths; show just
// the basename to keep the toast narrow. Manifest-discovered domains
// use the same heuristic split (composite key contains a slash) since
// the client can't distinguish kind without a manifest-cache fetch.
export function toToastBody(domain: string, key: string): string {
  if (
    domain === "dialog" ||
    domain === "balloon" ||
    domain === "codex-entry"
  ) {
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
