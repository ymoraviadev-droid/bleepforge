import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { Pickup } from "@bleepforge/shared";
import { config } from "../../config.js";

// Pickups (collectible scenes) — read from `world/collectibles/<name>/<name>.tscn`
// in the Godot project. We don't author these in Bleepforge; this endpoint
// just surfaces enough metadata for the NPC LootTable editor + integrity
// checks. Cached for 30s so the dropdown doesn't pay file I/O on every
// keystroke.

const COLLECTIBLES_REL = "world/collectibles";
const CACHE_TTL_MS = 30_000;

let cache: { at: number; pickups: Pickup[] } | null = null;

function readUidAttr(text: string): string {
  // [gd_scene format=3 uid="uid://..."]
  const m = text.match(/^\[gd_scene\b[^\]]*\buid\s*=\s*"([^"]+)"/m);
  return m?.[1] ?? "";
}

function readDbItemName(text: string): string {
  // Look for a top-level `DbItemName = "..."` property line on the root node.
  // Multiline doesn't matter — these are simple `key = value` rows.
  const m = text.match(/^DbItemName\s*=\s*"([^"]*)"/m);
  return m?.[1] ?? "";
}

async function discover(): Promise<Pickup[]> {
  if (!config.godotProjectRoot) return [];
  const root = path.join(config.godotProjectRoot, COLLECTIBLES_REL);
  let dirs;
  try {
    dirs = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Pickup[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const sub = path.join(root, d.name);
    let entries;
    try {
      entries = await fs.readdir(sub, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.isFile() || !f.name.endsWith(".tscn")) continue;
      const abs = path.join(sub, f.name);
      let text: string;
      try {
        text = await fs.readFile(abs, "utf8");
      } catch {
        continue;
      }
      const name = f.name.replace(/\.tscn$/, "");
      const resPath = `res://${COLLECTIBLES_REL}/${d.name}/${f.name}`;
      out.push({
        path: resPath,
        name,
        uid: readUidAttr(text),
        dbItemName: readDbItemName(text),
      });
    }
  }
  // Stable sort by name so the dropdown order is predictable.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function listPickups(): Promise<Pickup[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.pickups;
  const pickups = await discover();
  cache = { at: now, pickups };
  return pickups;
}

// Watcher hook (called by the .tres file watcher when a .tscn under
// `world/collectibles/` changes) so the cache invalidates promptly.
export function invalidatePickupCache() {
  cache = null;
}

export const pickupsRouter = Router();

pickupsRouter.get("/", async (_req, res) => {
  res.json(await listPickups());
});
