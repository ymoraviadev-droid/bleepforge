// ProjectIndex — runtime singleton holding a content-driven map of every
// authored Godot resource the editor needs to locate. Replaces the
// hardcoded-folder walks that used to live in writer.ts, uidLookup.ts,
// iconRouter.ts, pickup/router.ts, and reimportOne.ts.
//
// Lifecycle:
//   - boot: app.ts calls `await projectIndex.build(root)` once, before the
//     reconcile pass that consumes it.
//   - runtime: the .tres + .tscn watcher calls `upsert(absPath)` on every
//     add/change and `remove(absPath)` on unlink, so the index stays
//     coherent across the session.
//   - re-build: never. There's no global "rebuild now" — every change
//     flows through upsert/remove. A drift would require a full restart.
//
// Performance characteristics: ~90 .tres + ~10 .tscn files in this corpus
// → boot build is ~100–300ms on a warm fs. Every subsequent lookup is
// O(1) Map.get.

import {
  buildProjectIndex,
  classifyTresOne,
  classifyTscnOne,
} from "./build.js";
import type {
  IndexEntry,
  IndexedDomain,
  IndexedPickup,
  IndexedTres,
} from "./types.js";

class ProjectIndex {
  // Per-domain entity-id → entry.
  private byDomain = new Map<IndexedDomain, Map<string, IndexedTres>>();
  // Pickup .tscn entries, keyed by absPath (unambiguous; filename can collide
  // across folders once we walk the whole project).
  private pickups = new Map<string, IndexedPickup>();
  // Reverse lookups for ext_resource / watcher consumers.
  private byAbsPath = new Map<string, IndexEntry>();
  private byUid = new Map<string, IndexEntry>();
  private byResPath = new Map<string, IndexEntry>();

  private root: string | null = null;

  constructor() {
    // Pre-create per-domain maps so callers can rely on get() returning a
    // Map (never undefined) when they want to iterate.
    for (const d of [
      "item",
      "quest",
      "karma",
      "faction",
      "npc",
      "dialog",
      "balloon",
    ] as IndexedDomain[]) {
      this.byDomain.set(d, new Map());
    }
  }

  // ---- Build / refresh ----------------------------------------------------

  async build(godotRoot: string): Promise<{
    durationMs: number;
    tresCount: number;
    pickupCount: number;
    filesVisited: number;
  }> {
    this.root = godotRoot;
    const t0 = Date.now();
    this.clear();
    const built = await buildProjectIndex(godotRoot);
    for (const entry of built.tresEntries) this.insertTres(entry);
    for (const entry of built.pickupEntries) this.insertPickup(entry);
    return {
      durationMs: Date.now() - t0,
      tresCount: built.tresEntries.length,
      pickupCount: built.pickupEntries.length,
      filesVisited: built.filesVisited,
    };
  }

  /**
   * Re-read one file from disk and update the index. Called by the
   * watcher on `add` / `change`. Idempotent — removes any previous entry
   * for this absPath before inserting the new classification.
   */
  async upsert(absPath: string): Promise<IndexEntry | null> {
    if (!this.root) return null;
    // Remove old entry (if any) so a reclassified file doesn't leave a
    // stale entry in its previous domain bucket.
    this.removeAbsPath(absPath);
    // Build a single-file walk by reading + re-using the classifiers.
    // Simpler than exporting them — we just re-run buildProjectIndex on
    // the file's parent dir? No — that would walk more than we need.
    // Use the same classify functions via a one-file pseudo-walk.
    return await this.classifyOne(absPath);
  }

  /**
   * Remove an entry. Called by the watcher on `unlink`. No-op if the
   * file wasn't indexed.
   */
  remove(absPath: string): void {
    this.removeAbsPath(absPath);
  }

  // ---- Lookups ------------------------------------------------------------

  /** Look up a .tres entry by domain + id. */
  get(domain: IndexedDomain, id: string): IndexedTres | null {
    return this.byDomain.get(domain)?.get(id) ?? null;
  }

  /** Look up any entry (.tres or .tscn pickup) by absolute filesystem path. */
  getByAbsPath(absPath: string): IndexEntry | null {
    return this.byAbsPath.get(absPath) ?? null;
  }

  /** Look up by Godot UID (`uid://...`). Both .tres and .tscn included. */
  getByUid(uid: string): IndexEntry | null {
    return this.byUid.get(uid) ?? null;
  }

  /** Look up by Godot res:// path. Both .tres and .tscn included. */
  getByResPath(resPath: string): IndexEntry | null {
    return this.byResPath.get(resPath) ?? null;
  }

  /** All entries in one domain, in insertion order. */
  list(domain: IndexedDomain): IndexedTres[] {
    const m = this.byDomain.get(domain);
    return m ? Array.from(m.values()) : [];
  }

  /** All pickup .tscn entries. */
  listPickups(): IndexedPickup[] {
    return Array.from(this.pickups.values());
  }

  /** Whether the index has been built. */
  isReady(): boolean {
    return this.root !== null;
  }

  /** Godot project root the index was built against. */
  getRoot(): string | null {
    return this.root;
  }

  /** Stats for the Diagnostics surface. */
  stats(): { tresCount: number; pickupCount: number; root: string | null } {
    let tresCount = 0;
    for (const m of this.byDomain.values()) tresCount += m.size;
    return { tresCount, pickupCount: this.pickups.size, root: this.root };
  }

  // ---- Internal -----------------------------------------------------------

  private clear(): void {
    for (const m of this.byDomain.values()) m.clear();
    this.pickups.clear();
    this.byAbsPath.clear();
    this.byUid.clear();
    this.byResPath.clear();
  }

  private insertTres(entry: IndexedTres): void {
    this.byDomain.get(entry.domain)?.set(entry.id, entry);
    this.byAbsPath.set(entry.absPath, entry);
    this.byResPath.set(entry.resPath, entry);
    if (entry.uid) this.byUid.set(entry.uid, entry);
  }

  private insertPickup(entry: IndexedPickup): void {
    this.pickups.set(entry.absPath, entry);
    this.byAbsPath.set(entry.absPath, entry);
    this.byResPath.set(entry.resPath, entry);
    if (entry.uid) this.byUid.set(entry.uid, entry);
  }

  private removeAbsPath(absPath: string): void {
    const existing = this.byAbsPath.get(absPath);
    if (!existing) return;
    this.byAbsPath.delete(absPath);
    this.byResPath.delete(existing.resPath);
    if (existing.uid) this.byUid.delete(existing.uid);
    if (existing.domain === "pickup") {
      this.pickups.delete(absPath);
    } else {
      this.byDomain.get(existing.domain)?.delete(existing.id);
    }
  }

  /**
   * Single-file classify-and-insert. Reads + classifies one file using
   * the same content rules as the bootstrap walk, without re-walking the
   * project. Returns the new entry or null if the file doesn't match any
   * indexed shape.
   */
  private async classifyOne(absPath: string): Promise<IndexEntry | null> {
    if (!this.root) return null;
    if (absPath.endsWith(".tres")) {
      const entry = await classifyTresOne(absPath, this.root);
      if (entry) {
        this.insertTres(entry);
        return entry;
      }
    } else if (absPath.endsWith(".tscn")) {
      const entry = await classifyTscnOne(absPath, this.root);
      if (entry) {
        this.insertPickup(entry);
        return entry;
      }
    }
    return null;
  }
}

/** Module singleton. */
export const projectIndex = new ProjectIndex();
