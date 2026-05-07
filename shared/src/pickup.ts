// Pickups (collectible scenes) — read-only model surfaced to the client so
// the LootTable editor on the NPC page can show a dropdown of available
// scenes instead of free-form `res://` paths. Not a domain Bleepforge
// authors; lives in Godot as `world/collectibles/<name>/<name>.tscn` and
// the rest of the scene (sprite, collision shape, animation) needs Godot's
// scene editor to author. We just expose enough metadata for picking +
// integrity checks.

export interface Pickup {
  /** `res://world/collectibles/.../<name>.tscn` */
  path: string;
  /** Basename without `.tscn`. */
  name: string;
  /** Godot UID from the scene header — `uid://...`. Empty string if unset. */
  uid: string;
  /** The `DbItemName` property on the scene's root node (links to ItemData
   *  by slug). Empty string if unset / not found. */
  dbItemName: string;
}
