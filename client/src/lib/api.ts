import type {
  Balloon,
  CodexCategoryGroup,
  CodexCategoryMeta,
  CodexEntry,
  Concept,
  DialogSequence,
  FactionData,
  HelpCategoryGroup,
  HelpCategoryMeta,
  HelpEntry,
  Item,
  KarmaImpact,
  Manifest,
  Npc,
  Pickup,
  Preferences,
  Project,
  Quest,
} from "@bleepforge/shared";
import { bumpAssetMtime, getAssetMtime } from "./assets/mtimeCache";
import { noteLocalShaderSave } from "./shaders/localSaves";
import type { Store } from "./stores/createStore";
import type { FolderedStore } from "./stores/createFolderedStore";

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

// `getStore` is a lazy getter (not the store directly) to sidestep the
// circular module dependency — stores/items.ts imports itemsApi for its
// fetcher, api.ts imports itemStore for the patch path. The closure
// reads the store binding at user-call time, by which point both
// modules have finished evaluating.
const crud = <T>(opts: {
  name: string;
  keyOf: (entity: T) => string;
  getStore: () => Store<T>;
}): ResourceApi<T> => {
  const { name, keyOf, getStore } = opts;
  return {
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
      const saved = unwrapSavedResponse<T>(data, `${name}/${keyOf(entity)}`);
      // Patch the store directly from the response — saves a round-trip
      // refetch. The server reads back the JSON after writing, so the
      // returned entity is authoritative.
      getStore().patch(saved);
      return saved;
    },
    remove: async (key) => {
      const r = await fetch(`/api/${name}/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!r.ok && r.status !== 404) {
        throw new Error(`delete ${name} failed: ${r.status}`);
      }
      getStore().remove(key);
    },
  };
};

export const assetUrl = (path: string): string => {
  const base = `/api/asset?path=${encodeURIComponent(path)}`;
  // When mtime is known, append it as a cache-buster. The server
  // ships immutable-cache headers for URLs that carry `v` — see
  // server/src/lib/asset/router.ts. Unknown paths fall back to the
  // bare URL which keeps the legacy no-cache behavior. First-time
  // renders happen during the brief window before the boot prefetch
  // completes; subsequent renders hit the cache.
  const mtime = getAssetMtime(path);
  return mtime !== undefined ? `${base}&v=${mtime}` : base;
};

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

// Each api wires its matching store via a lazy getter — see the note on
// `crud<T>` above for why the indirection. Imports are below to keep
// the top of api.ts focused on the crud factory.
import { balloonStore } from "./stores/balloons";
import { codexStore } from "./stores/codex";
import { dialogStore } from "./stores/dialogs";
import { factionStore } from "./stores/factions";
import { itemStore } from "./stores/items";
import { karmaStore } from "./stores/karma";
import { npcStore } from "./stores/npcs";
import { questStore } from "./stores/quests";
import { shaderStore } from "./stores/shaders";

export const questsApi = crud<Quest>({ name: "quests", keyOf: (e) => e.Id, getStore: () => questStore });
export const itemsApi = crud<Item>({ name: "items", keyOf: (e) => e.Slug, getStore: () => itemStore });
export const karmaApi = crud<KarmaImpact>({ name: "karma", keyOf: (e) => e.Id, getStore: () => karmaStore });
export const npcsApi = crud<Npc>({ name: "npcs", keyOf: (e) => e.NpcId, getStore: () => npcStore });
export const factionsApi = crud<FactionData>({ name: "factions", keyOf: (e) => e.Faction, getStore: () => factionStore });

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

// Multi-project layer. List + active marker for the /projects page; PUT
// /active sets the new active slug (server captures it at boot, so a
// restart is what actually swaps paths over).
export interface ProjectsList {
  projects: Project[];
  /** What the NEXT server boot will load. Written on create / switch /
   *  import-once. */
  activeSlug: string | null;
  /** What THIS server's in-process config has captured — the project
   *  currently being served. Diverges from activeSlug when a create or
   *  switch wrote a new pointer but the server hasn't been restarted
   *  yet. Components that need to display "what's the user seeing right
   *  now" should read this; components that need "what was queued" read
   *  activeSlug. */
  runtimeActiveSlug: string | null;
  /** The Godot root the running server captured for the active project
   *  at boot. May lag behind the registry's stored value after a
   *  Preferences save; useRestartRequired surfaces the discrepancy. */
  runtimeGodotProjectRoot: string | null;
  bleepforgeRoot: string;
}

export interface SetActiveResult {
  ok: boolean;
  activeSlug: string;
  /** True when the caller should restart the app to pick up the change.
   *  False when the requested slug already matched the running active
   *  project — no restart needed. */
  restartRequired: boolean;
  noop: boolean;
}

export interface CreateProjectBody {
  displayName: string;
  mode: "sync" | "notebook";
  /** Sync-mode only (phase 6+). */
  godotProjectRoot?: string;
  /** Defaults to true on the server — new project becomes active. Pass
   *  false explicitly to create without flipping the active pointer. */
  setActive?: boolean;
}

export interface CreateProjectResult {
  ok: boolean;
  project: Project;
  activeSlug: string | null;
  restartRequired: boolean;
}

export interface ImportOnceBody {
  displayName: string;
  sourceGodotRoot: string;
}

export const projectsApi = {
  list: async (): Promise<ProjectsList> => {
    const r = await fetch("/api/projects");
    if (!r.ok) throw new Error(`list projects failed: ${r.status}`);
    return r.json();
  },
  create: async (body: CreateProjectBody): Promise<CreateProjectResult> => {
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`create project failed: ${r.status} ${detail}`);
    }
    return r.json();
  },
  importOnce: async (body: ImportOnceBody): Promise<CreateProjectResult> => {
    const r = await fetch("/api/projects/import-once", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`import-once project failed: ${r.status} ${detail}`);
    }
    return r.json();
  },
  setActive: async (slug: string): Promise<SetActiveResult> => {
    const r = await fetch("/api/projects/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`set active project failed: ${r.status} ${detail}`);
    }
    return r.json();
  },
  rename: async (slug: string, displayName: string): Promise<Project> => {
    const r = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`rename project failed: ${r.status} ${detail}`);
    }
    const body = (await r.json()) as { project: Project };
    return body.project;
  },
  /** Remove from registry. `wipe=true` also `rm -rf`s the project's
   *  on-disk dir (data/ + content/). Sync-mode projects' Godot trees
   *  are never touched regardless of wipe. */
  /** Hot-reload the active project on the running server. Re-reads
   *  active-project.json, recomputes config paths, tears down + rebuilds
   *  caches + watcher, runs reconcile / pending-import seed against the
   *  newly-active project. No app restart needed; downstream API calls
   *  see the new project's data the moment this resolves. */
  reload: async (): Promise<{
    ok: boolean;
    prev: string | null;
    next: string | null;
    durationMs: number;
  }> => {
    const r = await fetch("/api/projects/reload", { method: "POST" });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`reload project failed: ${r.status} ${detail}`);
    }
    return r.json();
  },
  remove: async (
    slug: string,
    wipe: boolean,
  ): Promise<{ ok: boolean; slug: string; wiped: boolean; wipeError?: string }> => {
    const qs = wipe ? "?wipe=true" : "";
    const r = await fetch(
      `/api/projects/${encodeURIComponent(slug)}${qs}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`delete project failed: ${r.status} ${detail}`);
    }
    return r.json();
  },
};

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
  clear: async (): Promise<void> => {
    const r = await fetch("/api/logs/clear", { method: "POST" });
    if (!r.ok) throw new Error(`clear logs failed: ${r.status}`);
  },
};

// Server process info — Diagnostics → Process tab. Read-only snapshot of
// what the running server thinks it is.
export interface ProcessInfo {
  bleepforgeVersion: string;
  nodeVersion: string;
  platform: string;
  pid: number;
  port: number;
  startedAt: string;
  uptimeMs: number;
  dataRoot: string;
  assetRoot: string;
  contentRoot: string | null;
  godotProjectRoot: string | null;
  godotProjectRootSource: "project" | "env" | null;
  bleepforgeRoot: string;
  activeProjectSlug: string | null;
  projectMode: "sync" | "notebook" | null;
}

export const processApi = {
  get: async (): Promise<ProcessInfo> => {
    const r = await fetch("/api/process");
    if (!r.ok) throw new Error(`get process failed: ${r.status}`);
    return r.json();
  },
};

// Bleepforge manifest — Diagnostics → Manifest tab. Reads
// bleepforge_manifest.json from the active project's Godot root (sync
// mode only). The library on the Godot side (godot-lib, v0.2.6 Phase 3)
// emits this file; the editor consumes it to drive generic surfaces in
// v0.2.7+.
export type ManifestLoadStatus = "not-applicable" | "missing" | "ok" | "error";

export interface ManifestValidationIssue {
  path: string;
  message: string;
}

export interface ManifestLoadResult {
  status: ManifestLoadStatus;
  filePath?: string;
  resPath?: string;
  mtime?: string;
  sizeBytes?: number;
  manifest?: Manifest;
  error?: string;
  issues?: ManifestValidationIssue[];
  reason?: string;
}

export const manifestApi = {
  get: async (): Promise<ManifestLoadResult> => {
    const r = await fetch("/api/manifest");
    if (!r.ok) throw new Error(`get manifest failed: ${r.status}`);
    return r.json();
  },
};

// Manifest-declared domain discovery — the read-only MVP surface for
// v0.2.7. Two routes:
//   - GET /api/manifest-domain        → { domains: ManifestDomainSummary[] }
//   - GET /api/manifest-domain/:name  → { entry, entities }

export interface ManifestDomainSummary {
  domain: string;
  kind: "domain" | "foldered" | "enumKeyed" | "discriminatedFamily";
  class: string | null;
  view: "list" | "cards" | "graph";
  overrideUi: string | null;
  displayName: string | null;
  entityCount: number;
}

export interface ManifestEntity {
  id: string;
  absPath: string;
  resPath: string;
  uid: string | null;
  scriptClass: string | null;
  folder: string | null;
}

import type { Entry as ManifestEntry } from "@bleepforge/shared";

export interface ManifestDomainDetail {
  entry: ManifestEntry;
  entities: ManifestEntity[];
}

export const manifestDomainsApi = {
  list: async (): Promise<{ domains: ManifestDomainSummary[] }> => {
    const r = await fetch("/api/manifest-domain");
    if (!r.ok) throw new Error(`list manifest domains failed: ${r.status}`);
    return r.json();
  },
  get: async (domain: string): Promise<ManifestDomainDetail> => {
    const r = await fetch(`/api/manifest-domain/${encodeURIComponent(domain)}`);
    if (!r.ok) throw new Error(`get manifest domain "${domain}" failed: ${r.status}`);
    return r.json();
  },
};

// Watcher status — Diagnostics → Watcher tab. Combines a liveness check
// with a small ring of recent .tres events + their outcomes.
export type WatcherEventKind = "add" | "change" | "unlink";
export type WatcherEventOutcome =
  | "reimported"
  | "deleted"
  | "ignored-self-write"
  | "ignored-not-domain"
  | "failed";

export interface WatcherEvent {
  ts: string;
  kind: WatcherEventKind;
  path: string;
  outcome: WatcherEventOutcome;
  detail?: string;
}

export interface WatcherStatus {
  active: boolean;
  root: string | null;
  watchedFileCount: number;
  recentEvents: WatcherEvent[];
}

export const watcherApi = {
  get: async (): Promise<WatcherStatus> => {
    const r = await fetch("/api/watcher");
    if (!r.ok) throw new Error(`get watcher failed: ${r.status}`);
    return r.json();
  },
};

// Save activity feed — Diagnostics → Saves tab. Combines two flows:
//   - "outgoing": Bleepforge → Godot writeback (every PUT that touches a .tres)
//   - "incoming": Godot → Bleepforge reimport (watcher caught a .tres change)
// Live updates flow over SSE on /api/saves/events; the snapshot endpoint is
// the initial fill on tab open.
export type SaveDirection = "outgoing" | "incoming";
export type SaveOutcome = "ok" | "warning" | "error";
export type SaveAction = "updated" | "deleted";

// Mirrors the server's SaveDomain union (v0.2.2 extended this with
// three Bleepforge-only domains that don't have a .tres watcher
// counterpart — concept / codex-entry / codex-category — so their
// manual Save buttons also show up in the Saves audit feed AND fire
// outgoing-save toasts). Kept as a separate type alias so the client
// stays decoupled from the sync stream's exports.
export type SaveDomain =
  | "item"
  | "karma"
  | "quest"
  | "dialog"
  | "npc"
  | "faction"
  | "balloon"
  | "shader"
  | "concept"
  | "codex-entry"
  | "codex-category";

export interface SaveEntry {
  ts: string;
  direction: SaveDirection;
  domain: SaveDomain;
  key: string; // "<folder>/<id>" for dialogs; primary key otherwise
  action: SaveAction;
  outcome: SaveOutcome;
  path?: string;
  warnings?: string[];
  error?: string;
}

export const savesApi = {
  list: async (): Promise<SaveEntry[]> => {
    const r = await fetch("/api/saves");
    if (!r.ok) throw new Error(`get saves failed: ${r.status}`);
    return r.json();
  },
  clear: async (): Promise<void> => {
    const r = await fetch("/api/saves/clear", { method: "POST" });
    if (!r.ok) throw new Error(`clear saves failed: ${r.status}`);
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
    // keepalive: lets the request finish flying even if the renderer
    // closes mid-PUT (Electron popout window closed right after a
    // theme change). Without this, the request gets killed with the
    // renderer process and the server keeps the old value — which then
    // beats the local cache on the next initAsync reconcile, flipping
    // the user's just-applied change back. The Preferences doc is
    // well under the 64KB keepalive body limit.
    const r = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
      keepalive: true,
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
    const saved = unwrapSavedResponse<DialogSequence>(data, `dialogs/${folder}/${sequence.Id}`);
    dialogStore.patch(folder, saved);
    return saved;
  },
  remove: async (folder: string, id: string): Promise<void> => {
    const r = await fetch(
      `/api/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!r.ok && r.status !== 404) {
      throw new Error(`remove dialog failed: ${r.status}`);
    }
    dialogStore.remove(folder, id);
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

export interface BalloonFolderGroup {
  folder: string;
  balloons: Balloon[];
}

// Folder-aware API for the Balloons domain. <folder> is the NPC robot
// model directory ("hap_500", "sld_300"). Each balloon's Bleepforge id
// (its filename basename) is unique within its folder but not globally —
// matches the dialog folder pattern.
export const balloonsApi = {
  listFolders: async (): Promise<string[]> => {
    const r = await fetch("/api/balloons/folders");
    if (!r.ok) throw new Error(`listFolders failed: ${r.status}`);
    return r.json();
  },
  listAll: async (): Promise<BalloonFolderGroup[]> => {
    const r = await fetch("/api/balloons");
    if (!r.ok) throw new Error(`list balloons failed: ${r.status}`);
    return r.json();
  },
  listInFolder: async (folder: string): Promise<Balloon[]> => {
    const r = await fetch(`/api/balloons/${encodeURIComponent(folder)}`);
    if (!r.ok) throw new Error(`listInFolder failed: ${r.status}`);
    return r.json();
  },
  get: async (folder: string, id: string): Promise<Balloon | null> => {
    const r = await fetch(
      `/api/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`,
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`get balloon failed: ${r.status}`);
    return r.json();
  },
  save: async (folder: string, balloon: Balloon): Promise<Balloon> => {
    const r = await fetch(
      `/api/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(balloon.Id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(balloon),
      },
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save balloon failed: ${r.status} ${body}`);
    }
    const data = await r.json();
    const saved = unwrapSavedResponse<Balloon>(data, `balloons/${folder}/${balloon.Id}`);
    balloonStore.patch(folder, saved);
    return saved;
  },
  remove: async (folder: string, id: string): Promise<void> => {
    const r = await fetch(
      `/api/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!r.ok && r.status !== 404) {
      throw new Error(`remove balloon failed: ${r.status}`);
    }
    balloonStore.remove(folder, id);
  },
};

// Folder-aware API for the Game Codex domain. Each <category> carries
// its own user-defined property schema (in `_meta.json`) plus N entries.
// Bleepforge-only — no .tres round-trip.
export const codexApi = {
  listAll: async (): Promise<CodexCategoryGroup[]> => {
    const r = await fetch("/api/codex");
    if (!r.ok) throw new Error(`list codex failed: ${r.status}`);
    return r.json();
  },
  listCategories: async (): Promise<string[]> => {
    const r = await fetch("/api/codex/categories");
    if (!r.ok) throw new Error(`listCategories failed: ${r.status}`);
    return r.json();
  },
  listInCategory: async (category: string): Promise<CodexEntry[]> => {
    const r = await fetch(`/api/codex/${encodeURIComponent(category)}`);
    if (!r.ok) throw new Error(`listInCategory failed: ${r.status}`);
    return r.json();
  },
  getMeta: async (category: string): Promise<CodexCategoryMeta | null> => {
    const r = await fetch(`/api/codex/${encodeURIComponent(category)}/_meta`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`get meta failed: ${r.status}`);
    return r.json();
  },
  saveMeta: async (meta: CodexCategoryMeta): Promise<CodexCategoryMeta> => {
    const r = await fetch(
      `/api/codex/${encodeURIComponent(meta.Category)}/_meta`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      },
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save meta failed: ${r.status} ${body}`);
    }
    const data = await r.json();
    const saved = unwrapSavedResponse<CodexCategoryMeta>(data, `codex/${meta.Category}/_meta`);
    // Meta changes touch the category schema, not just one entry — the
    // foldered store doesn't model a "patch meta" op, so we refresh the
    // single codex slice. Other slices are untouched.
    void codexStore.refresh();
    return saved;
  },
  removeCategory: async (category: string): Promise<void> => {
    const r = await fetch(`/api/codex/${encodeURIComponent(category)}`, {
      method: "DELETE",
    });
    if (!r.ok && r.status !== 404) {
      throw new Error(`remove category failed: ${r.status}`);
    }
    // Whole-folder removal (entire CodexCategoryGroup gone). The
    // foldered store has no removeFolder op — refresh the slice.
    void codexStore.refresh();
  },
  getEntry: async (category: string, id: string): Promise<CodexEntry | null> => {
    const r = await fetch(
      `/api/codex/${encodeURIComponent(category)}/${encodeURIComponent(id)}`,
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`get entry failed: ${r.status}`);
    return r.json();
  },
  saveEntry: async (category: string, entry: CodexEntry): Promise<CodexEntry> => {
    const r = await fetch(
      `/api/codex/${encodeURIComponent(category)}/${encodeURIComponent(entry.Id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      },
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save entry failed: ${r.status} ${body}`);
    }
    const data = await r.json();
    const saved = unwrapSavedResponse<CodexEntry>(data, `codex/${category}/${entry.Id}`);
    codexStore.patch(category, saved);
    return saved;
  },
  removeEntry: async (category: string, id: string): Promise<void> => {
    const r = await fetch(
      `/api/codex/${encodeURIComponent(category)}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!r.ok && r.status !== 404) {
      throw new Error(`remove entry failed: ${r.status}`);
    }
    codexStore.remove(category, id);
  },
};

// In-app Help. Read-only: Help content is authored directly in the JSON
// files under `data/help/`, not through the UI. The view pages call into
// these list/read methods only.
export const helpApi = {
  listAll: async (): Promise<HelpCategoryGroup[]> => {
    const r = await fetch("/api/help");
    if (!r.ok) throw new Error(`list help failed: ${r.status}`);
    return r.json();
  },
  listCategories: async (): Promise<string[]> => {
    const r = await fetch("/api/help/categories");
    if (!r.ok) throw new Error(`listCategories failed: ${r.status}`);
    return r.json();
  },
  listInCategory: async (category: string): Promise<HelpEntry[]> => {
    const r = await fetch(`/api/help/${encodeURIComponent(category)}`);
    if (!r.ok) throw new Error(`listInCategory failed: ${r.status}`);
    return r.json();
  },
  getMeta: async (category: string): Promise<HelpCategoryMeta | null> => {
    const r = await fetch(`/api/help/${encodeURIComponent(category)}/_meta`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`get meta failed: ${r.status}`);
    return r.json();
  },
  getEntry: async (category: string, id: string): Promise<HelpEntry | null> => {
    const r = await fetch(
      `/api/help/${encodeURIComponent(category)}/${encodeURIComponent(id)}`,
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`get entry failed: ${r.status}`);
    return r.json();
  },
};

// Server health snapshot.
export interface HealthInfo {
  ok: boolean;
  dataRoot: string;
  assetRoot: string;
}

export const healthApi = {
  get: async (): Promise<HealthInfo> => {
    const r = await fetch("/api/health");
    if (!r.ok) throw new Error(`get health failed: ${r.status}`);
    return r.json();
  },
};

// Image-asset descriptor mirroring server/src/lib/assets/types.ts. The
// gallery fetches /api/assets/images and renders a card per entry; the
// SSE channel pushes single-file deltas as the watcher catches them.
export type ImageFormat = "png" | "jpg" | "webp" | "gif" | "svg" | "bmp";

export interface ImageAsset {
  path: string;
  basename: string;
  parentDir: string;
  parentRel: string;
  format: ImageFormat;
  uid: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  mtimeMs: number;
}

export interface ImagesResponse {
  rebuiltAt: string | null;
  images: ImageAsset[];
}

// Reference back-link from a single asset to a place that points at it.
// Used by the gallery's "used by N" drawer to answer "where is this image
// used?" — a question Godot itself can't easily answer, since references
// span both .tres files and Bleepforge's JSON cache.
export type AssetUsageDomain =
  | "item"
  | "karma"
  | "quest"
  | "dialog"
  | "npc"
  | "faction"
  | "balloon"
  | "concept";

export interface AssetUsage {
  kind: "tres" | "tscn" | "json";
  domain: AssetUsageDomain | null;
  key: string | null;
  file: string;
  snippet: string;
}

export interface UsagesResponse {
  asset: ImageAsset | null;
  usages: AssetUsage[];
}

// Folder picker response — used by the importer to pick a destination
// inside the Godot project. Server filters to directories and excludes
// dot-dirs, so the picker UI just renders what comes back.
export interface FoldersResponse {
  cwd: string;
  cwdRel: string;
  parent: string | null;
  root: string;
  dirs: { name: string; path: string }[];
}

export interface ImportResult {
  ok: boolean;
  path: string;
  sizeBytes: number;
  overwritten: boolean;
}

export const assetsApi = {
  listImages: async (): Promise<ImagesResponse> => {
    const r = await fetch("/api/assets/images");
    if (!r.ok) throw new Error(`list images failed: ${r.status}`);
    return r.json();
  },
  usages: async (path: string): Promise<UsagesResponse> => {
    const r = await fetch(`/api/assets/usages?path=${encodeURIComponent(path)}`);
    if (!r.ok) throw new Error(`get usages failed: ${r.status}`);
    return r.json();
  },
  usageCounts: async (): Promise<Record<string, number>> => {
    const r = await fetch("/api/assets/usage-counts");
    if (!r.ok) throw new Error(`get usage-counts failed: ${r.status}`);
    const body = await r.json();
    return body.counts;
  },
  listFolders: async (dir?: string): Promise<FoldersResponse> => {
    const url = dir
      ? `/api/assets/folders?dir=${encodeURIComponent(dir)}`
      : "/api/assets/folders";
    const r = await fetch(url);
    if (!r.ok) throw new Error(`list folders failed: ${r.status}`);
    return r.json();
  },
  createFolder: async (input: {
    parentDir: string;
    name: string;
  }): Promise<{ ok: boolean; path: string }> => {
    const r = await fetch("/api/assets/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`create folder failed: ${r.status} ${body}`);
    }
    return r.json();
  },
  importImage: async (input: {
    targetDir: string;
    filename: string;
    contentBase64: string;
    overwrite?: boolean;
  }): Promise<ImportResult> => {
    const r = await fetch("/api/assets/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`import failed: ${r.status} ${body}`);
    }
    const result: ImportResult = await r.json();
    // Stamp the mtime cache immediately so AssetThumb renders for this
    // path use a fresh URL on the very next paint. The SSE asset event
    // arriving ~150ms later will overwrite with the watcher's mtime,
    // but Date.now() is good enough to force the URL to change now.
    bumpAssetMtime(result.path);
    return result;
  },
  deleteFile: async (path: string): Promise<{ ok: boolean; removed: string[] }> => {
    const r = await fetch(
      `/api/assets/file?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`delete failed: ${r.status} ${body}`);
    }
    return r.json();
  },
};

// Shader descriptor mirroring server/src/lib/shaders/types.ts. The
// shader list page fetches /api/shaders and renders a card per entry.
// Phase 1 is read-only (browse + view + usages); Phase 2 adds save +
// import + delete; Phase 3 adds the GDShader → GLSL ES translator + a
// WebGL2 preview canvas.
export type ShaderType =
  | "canvas_item"
  | "spatial"
  | "particles"
  | "sky"
  | "fog";

export interface ShaderAsset {
  path: string;
  basename: string;
  parentDir: string;
  parentRel: string;
  uid: string | null;
  shaderType: ShaderType | null;
  uniformCount: number;
  sizeBytes: number;
  mtimeMs: number;
  /** Bleepforge-only card pattern. Null when not yet set; client falls
   *  back to "scanlines" as the default at render time. */
  pattern: import("@bleepforge/shared").ShaderPattern | null;
  /** Bleepforge-only card color override. Null = no override; the card
   *  uses its shader_type's default tint. */
  color: import("@bleepforge/shared").ShaderCardColor | null;
}

export interface ShadersResponse {
  shaders: ShaderAsset[];
}

export interface ShaderFileResponse {
  asset: ShaderAsset | null;
  source: string;
}

// Same reference shape the assets surface uses — both look up "where is
// this thing used?" by scanning .tres + .tscn and mapping each matching
// .tres back to its Bleepforge edit page. Kept as a separate type alias
// here so api.ts stays decoupled from the server-side type module.
export type ShaderUsageDomain =
  | "item"
  | "karma"
  | "quest"
  | "dialog"
  | "npc"
  | "faction"
  | "balloon"
  | "concept";

export interface ShaderUsage {
  kind: "tres" | "tscn" | "json";
  domain: ShaderUsageDomain | null;
  key: string | null;
  file: string;
  snippet: string;
}

export interface ShaderUsagesResponse {
  asset: ShaderAsset | null;
  usages: ShaderUsage[];
}

export interface ShaderSaveResult {
  ok: boolean;
  asset: ShaderAsset | null;
}

export interface ShaderCreateResult {
  ok: boolean;
  path: string;
  asset: ShaderAsset | null;
  source: string;
}

export interface ShaderDeleteResult {
  ok: boolean;
  removed: string[];
}

export const shadersApi = {
  list: async (): Promise<ShadersResponse> => {
    const r = await fetch("/api/shaders");
    if (!r.ok) throw new Error(`list shaders failed: ${r.status}`);
    return r.json();
  },
  getFile: async (path: string): Promise<ShaderFileResponse> => {
    const r = await fetch(
      `/api/shaders/file?path=${encodeURIComponent(path)}`,
    );
    if (!r.ok) throw new Error(`get shader file failed: ${r.status}`);
    return r.json();
  },
  usages: async (path: string): Promise<ShaderUsagesResponse> => {
    const r = await fetch(
      `/api/shaders/usages?path=${encodeURIComponent(path)}`,
    );
    if (!r.ok) throw new Error(`get shader usages failed: ${r.status}`);
    return r.json();
  },
  usageCounts: async (): Promise<Record<string, number>> => {
    const r = await fetch("/api/shaders/usage-counts");
    if (!r.ok) throw new Error(`get shader usage-counts failed: ${r.status}`);
    const body = await r.json();
    return body.counts;
  },
  save: async (path: string, source: string): Promise<ShaderSaveResult> => {
    const r = await fetch("/api/shaders/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, source }),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`save shader failed: ${r.status} ${body}`);
    }
    // Mark this path as locally-saved so the echoed SSE event doesn't
    // toast in the same window the user just got Save-button feedback in.
    noteLocalShaderSave(path);
    const result: ShaderSaveResult = await r.json();
    if (result.asset) shaderStore.patch(result.asset);
    return result;
  },
  create: async (input: {
    targetDir: string;
    filename: string;
    shaderType?: ShaderType;
  }): Promise<ShaderCreateResult> => {
    const r = await fetch("/api/shaders/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`create shader failed: ${r.status} ${body}`);
    }
    const result: ShaderCreateResult = await r.json();
    noteLocalShaderSave(result.path);
    if (result.asset) shaderStore.patch(result.asset);
    return result;
  },
  setPattern: async (
    path: string,
    pattern: import("@bleepforge/shared").ShaderPattern,
  ): Promise<{ ok: boolean; asset: ShaderAsset | null }> => {
    const r = await fetch("/api/shaders/meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, pattern }),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`set shader pattern failed: ${r.status} ${body}`);
    }
    noteLocalShaderSave(path);
    const result: { ok: boolean; asset: ShaderAsset | null } = await r.json();
    if (result.asset) shaderStore.patch(result.asset);
    return result;
  },
  setColor: async (
    path: string,
    color: import("@bleepforge/shared").ShaderCardColor | null,
  ): Promise<{ ok: boolean; asset: ShaderAsset | null }> => {
    const r = await fetch("/api/shaders/meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, color }),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`set shader color failed: ${r.status} ${body}`);
    }
    noteLocalShaderSave(path);
    const result: { ok: boolean; asset: ShaderAsset | null } = await r.json();
    if (result.asset) shaderStore.patch(result.asset);
    return result;
  },
  deleteFile: async (path: string): Promise<ShaderDeleteResult> => {
    const r = await fetch(
      `/api/shaders/file?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`delete shader failed: ${r.status} ${body}`);
    }
    noteLocalShaderSave(path);
    shaderStore.remove(path);
    return r.json();
  },
};
