import type {
  Concept,
  DialogSequence,
  FactionData,
  Item,
  KarmaImpact,
  Npc,
  Pickup,
  Preferences,
  Quest,
} from "@bleepforge/shared";
import { refreshCatalog } from "./catalog-bus";

// Returned by the server alongside the saved entity. Lets us surface
// .tres write status to the user (or just log it if UI feedback isn't
// wired yet). All fields are optional; `attempted: false` means the
// server didn't try (no Godot project root configured, or singleton
// domain like concept/preferences with no .tres counterpart).
export interface TresWriteResult {
  attempted: boolean;
  ok?: boolean;
  path?: string;
  warnings?: string[];
  error?: string;
}

interface ResourceApi<T> {
  list: () => Promise<T[]>;
  get: (key: string) => Promise<T | null>;
  save: (entity: T) => Promise<T>;
  remove: (key: string) => Promise<void>;
}

// New servers return `{ entity, tresWrite }` from PUT. Older code paths
// (or domains without writers) return the entity directly. This adapter
// handles both, logs tresWrite to console for now, and returns the entity.
function unwrapSavedResponse<T>(data: unknown, label: string): T {
  if (data && typeof data === "object" && "entity" in (data as object)) {
    const wrapped = data as { entity: T; tresWrite?: TresWriteResult };
    if (wrapped.tresWrite?.attempted) {
      logTresWrite(label, wrapped.tresWrite);
    }
    return wrapped.entity;
  }
  return data as T;
}

function logTresWrite(label: string, r: TresWriteResult): void {
  if (r.ok) {
    const w = r.warnings && r.warnings.length > 0 ? ` (${r.warnings.length} warnings)` : "";
    console.log(`[tres-write] ${label} -> ${r.path}${w}`);
    if (r.warnings) for (const wn of r.warnings) console.log(`  ! ${wn}`);
  } else {
    console.warn(`[tres-write] FAILED for ${label}: ${r.error}`);
  }
}

const crud = <T>(name: string, keyOf: (entity: T) => string): ResourceApi<T> => ({
  list: async () => {
    const r = await fetch(`/api/${name}`);
    if (!r.ok) throw new Error(`list ${name} failed: ${r.status}`);
    return r.json();
  },
  get: async (key) => {
    const r = await fetch(`/api/${name}/${encodeURIComponent(key)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`get ${name} failed: ${r.status}`);
    return r.json();
  },
  save: async (entity) => {
    const r = await fetch(`/api/${name}/${encodeURIComponent(keyOf(entity))}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entity),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save ${name} failed: ${r.status} ${body}`);
    }
    const data = await r.json();
    refreshCatalog();
    return unwrapSavedResponse<T>(data, `${name}/${keyOf(entity)}`);
  },
  remove: async (key) => {
    const r = await fetch(`/api/${name}/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    if (!r.ok && r.status !== 404) {
      throw new Error(`delete ${name} failed: ${r.status}`);
    }
    refreshCatalog();
  },
});

export const assetUrl = (path: string): string =>
  `/api/asset?path=${encodeURIComponent(path)}`;

export type ItemIconResponse =
  | { kind: "atlas"; atlasPath: string; region: { x: number; y: number; w: number; h: number } }
  | { kind: "image"; imagePath: string }
  | null;

export const itemIconApi = {
  // Reads the Icon directly from the matching .tres in the Godot project.
  // Bleepforge's JSON Icon field is bypassed for display.
  get: async (slug: string): Promise<ItemIconResponse> => {
    const r = await fetch(`/api/item-icon/${encodeURIComponent(slug)}`);
    if (r.status === 404 || r.status === 503) return null;
    if (!r.ok) throw new Error(`get item-icon failed: ${r.status}`);
    return r.json();
  },
};

export const questsApi = crud<Quest>("quests", (e) => e.Id);
export const itemsApi = crud<Item>("items", (e) => e.Slug);
export const karmaApi = crud<KarmaImpact>("karma", (e) => e.Id);
export const npcsApi = crud<Npc>("npcs", (e) => e.NpcId);
export const factionsApi = crud<FactionData>("factions", (e) => e.Faction);

// Read-only list of collectible scenes from the Godot project. Used by the
// NPC LootTable editor to render a pickup-picker dropdown.
export const pickupsApi = {
  list: async (): Promise<Pickup[]> => {
    const r = await fetch("/api/pickups");
    if (!r.ok) throw new Error(`list pickups failed: ${r.status}`);
    return r.json();
  },
};

// Godot project root introspection. The "effective" root is whatever the
// running server resolved at boot; the "source" tells us whether it came
// from preferences.json or the GODOT_PROJECT_ROOT env var (or null on
// first run before either is set). Used by Preferences to detect when a
// saved project-root change is pending a server restart.
export interface GodotProjectInfo {
  effective: string | null;
  source: "preferences" | "env" | null;
}

export interface GodotProjectValidation {
  ok: boolean;
  exists: boolean;
  isProject: boolean;
  message?: string;
}

export const godotProjectApi = {
  get: async (): Promise<GodotProjectInfo> => {
    const r = await fetch("/api/godot-project");
    if (!r.ok) throw new Error(`get godot-project failed: ${r.status}`);
    return r.json();
  },
  validate: async (path: string): Promise<GodotProjectValidation> => {
    const r = await fetch(
      `/api/godot-project/validate?path=${encodeURIComponent(path)}`,
    );
    if (!r.ok) throw new Error(`validate godot-project failed: ${r.status}`);
    return r.json();
  },
};

// Reports the last boot-time reconcile result. Powers the header diagnostic
// badge — without it, a single broken .tres silently leaves one domain with
// stale JSON and the UI gives no signal. Returns null if the server hasn't
// completed its first reconcile yet (rare: tiny window between listen and
// the runImport callback finishing).
export type ReconcileDomain = "items" | "quests" | "karma" | "factions" | "dialogs" | "npcs";

export interface ReconcileStatus {
  ranAt: string;
  durationMs: number;
  ok: boolean;
  perDomain: Record<ReconcileDomain, { imported: number; skipped: number; errors: number }>;
  errorDetails: { domain: string; file: string; error: string }[];
  skippedDetails: { domain: string; file: string; reason: string }[];
  error?: string;
}

export const reconcileApi = {
  getStatus: async (): Promise<ReconcileStatus | null> => {
    const r = await fetch("/api/reconcile/status");
    if (!r.ok) throw new Error(`get reconcile status failed: ${r.status}`);
    return r.json();
  },
};

// In-memory server-log buffer (last ~1000 entries). Surfaced in the Logs tab
// of /diagnostics. v1 is fetch-on-demand — no streaming yet, the user clicks
// refresh / revisits the tab to see new lines.
export type LogLevel = "info" | "warning" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
}

export const logsApi = {
  list: async (): Promise<LogEntry[]> => {
    const r = await fetch("/api/logs");
    if (!r.ok) throw new Error(`get logs failed: ${r.status}`);
    return r.json();
  },
};

// Singleton-style preferences doc — global themes (color + typography bundles)
// and the active one. Lives at data/preferences.json.
export const preferencesApi = {
  get: async (): Promise<Preferences> => {
    const r = await fetch("/api/preferences");
    if (!r.ok) throw new Error(`get preferences failed: ${r.status}`);
    return r.json();
  },
  save: async (prefs: Preferences): Promise<Preferences> => {
    const r = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save preferences failed: ${r.status} ${body}`);
    }
    const data = await r.json();
    return unwrapSavedResponse<Preferences>(data, "preferences");
  },
};

// Singleton-style document — one concept doc per project. GET returns either
// the saved doc or an empty default; PUT overwrites.
export const conceptApi = {
  get: async (): Promise<Concept> => {
    const r = await fetch("/api/concept");
    if (!r.ok) throw new Error(`get concept failed: ${r.status}`);
    return r.json();
  },
  save: async (concept: Concept): Promise<Concept> => {
    const r = await fetch("/api/concept", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(concept),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save concept failed: ${r.status} ${body}`);
    }
    const data = await r.json();
    return unwrapSavedResponse<Concept>(data, "concept");
  },
};

export interface DialogFolderGroup {
  folder: string;
  sequences: DialogSequence[];
}

export interface EdgeStyle {
  shape: "curved" | "straight";
  dashed: boolean;
  waypoints: { x: number; y: number }[];
}

export interface DialogLayout {
  nodes: Record<string, { x: number; y: number }>;
  edges: Record<string, EdgeStyle>;
}

export const emptyLayout = (): DialogLayout => ({ nodes: {}, edges: {} });

export const dialogsApi = {
  listFolders: async (): Promise<string[]> => {
    const r = await fetch("/api/dialogs/folders");
    if (!r.ok) throw new Error(`listFolders failed: ${r.status}`);
    return r.json();
  },
  listAll: async (): Promise<DialogFolderGroup[]> => {
    const r = await fetch("/api/dialogs");
    if (!r.ok) throw new Error(`list dialogs failed: ${r.status}`);
    return r.json();
  },
  listInFolder: async (folder: string): Promise<DialogSequence[]> => {
    const r = await fetch(`/api/dialogs/${encodeURIComponent(folder)}`);
    if (!r.ok) throw new Error(`listInFolder failed: ${r.status}`);
    return r.json();
  },
  get: async (folder: string, id: string): Promise<DialogSequence | null> => {
    const r = await fetch(
      `/api/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`,
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`get dialog failed: ${r.status}`);
    return r.json();
  },
  save: async (folder: string, sequence: DialogSequence): Promise<DialogSequence> => {
    const r = await fetch(
      `/api/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(sequence.Id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sequence),
      },
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save dialog failed: ${r.status} ${body}`);
    }
    const data = await r.json();
    refreshCatalog();
    return unwrapSavedResponse<DialogSequence>(data, `dialogs/${folder}/${sequence.Id}`);
  },
  remove: async (folder: string, id: string): Promise<void> => {
    const r = await fetch(
      `/api/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!r.ok && r.status !== 404) {
      throw new Error(`remove dialog failed: ${r.status}`);
    }
    refreshCatalog();
  },
  getLayout: async (folder: string): Promise<DialogLayout> => {
    const r = await fetch(`/api/dialogs/${encodeURIComponent(folder)}/_layout`);
    if (!r.ok) throw new Error(`getLayout failed: ${r.status}`);
    return r.json();
  },
  saveLayout: async (folder: string, layout: DialogLayout): Promise<DialogLayout> => {
    const r = await fetch(`/api/dialogs/${encodeURIComponent(folder)}/_layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    });
    if (!r.ok) throw new Error(`saveLayout failed: ${r.status}`);
    return r.json();
  },
};
