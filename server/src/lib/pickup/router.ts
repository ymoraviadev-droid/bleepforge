import { Router } from "express";
import type { Pickup } from "@bleepforge/shared";

import { projectIndex } from "../projectIndex/index.js";

// Pickups (collectible scenes) — surfaced read-only for the NPC LootTable
// editor + integrity checks. Backed by ProjectIndex: a .tscn anywhere in
// the project that has a `DbItemName = "..."` on its root node counts as
// a pickup (no hardcoded folder convention — moving a scene around or
// adding new collectible directories Just Works at next boot).
//
// The watcher keeps the index live, so there's no per-endpoint cache or
// invalidate hook anymore — every GET returns the freshest list.

export async function listPickups(): Promise<Pickup[]> {
  const entries = projectIndex.listPickups();
  const out: Pickup[] = entries.map((e) => ({
    path: e.resPath,
    name: e.name,
    uid: e.uid ?? "",
    dbItemName: e.dbItemName,
  }));
  // Stable sort by name so the dropdown order is predictable.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export const pickupsRouter = Router();

pickupsRouter.get("/", async (_req, res) => {
  res.json(await listPickups());
});
