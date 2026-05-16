// ProjectIndex types — the runtime map from "entity id" → ".tres file"
// for every authored Godot resource the editor needs to find without
// hardcoding folder paths.
//
// Two entry shapes:
//   - IndexedTres: any of the seven game-domain .tres files (item, quest,
//     karma, faction, npc, dialog, balloon). Classified by content (Slug
//     presence for items, script_class for the rest) at index-build time.
//   - IndexedPickup: a .tscn whose root node carries a DbItemName property.
//     These are the in-game collectible scenes the NPC LootTable editor
//     picks from.
//
// Both expose `absPath` + `resPath` + `uid` so the writer / icon-router /
// uid-lookup callers get everything they need from a single lookup, never
// re-walking the project.

/**
 * Domain identifier. Open type because manifest-declared domains add to
 * the set at boot — the closed union was a v0.2.6 holdover when only
 * FoB's hardcoded set existed.
 *
 * FoB's reserved literals (still in use through the v0.2.7 → v0.2.9
 * genericization arc, retire when FoB ports to BleepforgeRegistry):
 *   "item" | "quest" | "karma" | "faction" | "npc" | "dialog" | "balloon"
 *
 * Manifest domains use whatever name the user declared in
 * `bleepforge_manifest.json`'s `domains[].domain` field. Conflicts
 * with FoB's reserved set: FoB classifiers run first; manifest
 * classifiers only fire when no FoB classifier matched the file. A
 * future schema validation could surface name collisions at manifest
 * parse time, but for v0.2.7 we rely on "FoB wins" + a watcher-log
 * note (no FoB names should appear in user manifests post-port).
 */
export type IndexedDomain = string;

export interface IndexedTres {
  domain: IndexedDomain;
  /**
   * Domain-specific identity:
   *   - item: Slug
   *   - quest / karma / dialog: Id
   *   - npc: NpcId
   *   - faction: Faction enum string ("Scavengers" / "FreeRobots" / "RFF" / "Grove")
   *   - balloon: "<model>/<basename>" composite (BalloonLine has no Id field in C#)
   */
  id: string;
  absPath: string;
  /** "res://..." path Godot uses for ext_resource refs. */
  resPath: string;
  /** From [gd_resource ... uid="uid://..."] header, or null if missing. */
  uid: string | null;
  /**
   * The `script_class="..."` declared in the .tres header. Null when no
   * script class line is present (currently can happen for some items,
   * which are bucketed by Slug presence not script_class). Tracked here
   * so `refScan/detectDomain.ts` and similar consumers can skip their own
   * classification pass.
   */
  scriptClass: string | null;
  /**
   * Bleepforge-folder context for the two folder-aware domains:
   *   - dialog: parent dir basename (the "folder" — Eddie, Krang, …)
   *   - balloon: grandparent dir basename (the NPC model — hap_500, …)
   * Null for the other five domains.
   */
  folder: string | null;
}

export interface IndexedPickup {
  domain: "pickup";
  absPath: string;
  resPath: string;
  uid: string | null;
  /** Filename basename without `.tscn`. NOT guaranteed unique project-wide. */
  name: string;
  /** Value of the root node's `DbItemName = "..."` property, or "" if absent. */
  dbItemName: string;
}

/** Union of everything stored in the project index. */
export type IndexEntry = IndexedTres | IndexedPickup;
