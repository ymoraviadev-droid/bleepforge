import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import {
  PreferencesSchema,
  emptyPreferences,
  type Preferences,
} from "@bleepforge/shared";
import { config, isSyncMode } from "../../config.js";
import {
  findProject,
  readRegistry,
  writeRegistry,
} from "../../lib/projects/registry.js";

// Singleton document — `<dataRoot>/preferences.json`. Holds the user's saved
// global themes (color theme + typography bundle, one per named entry) and
// the name of the currently active one. Mirrors the concept router exactly:
// GET (with empty fallback) + PUT, no list, no .tres pipeline.
//
// The schema still carries a `godotProjectRoot` field for backwards-compat
// with the Preferences UI's existing Godot-root section, but the canonical
// source of that value (post-v0.2.6) is the active project record. The PUT
// handler write-throughs changes to the record so the existing flow keeps
// working — user edits godotProjectRoot in Preferences → restart → server
// reads the new value from the project record at boot.

const preferencesFile = (): string => path.join(config.dataRoot, "preferences.json");

async function read(): Promise<Preferences> {
  try {
    const raw = await fs.readFile(preferencesFile(), "utf8");
    return PreferencesSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyPreferences();
    throw err;
  }
}

async function write(p: Preferences): Promise<Preferences> {
  const validated = PreferencesSchema.parse(p);
  await fs.mkdir(path.dirname(preferencesFile()), { recursive: true });
  await fs.writeFile(preferencesFile(), JSON.stringify(validated, null, 2), "utf8");
  return validated;
}

/** Propagate the saved godotProjectRoot into the active project record so
 *  config.ts reads the new value on the next boot. No-op in three cases:
 *  no active project (first-run path handles it separately), notebook
 *  mode (godotProjectRoot is meaningless there — a notebook project has
 *  no Godot connection), or no change. */
function writeGodotRootThrough(prefs: Preferences): void {
  if (!config.activeProjectSlug) return;
  if (!isSyncMode()) return;
  const registry = readRegistry(config.bleepforgeRoot);
  if (!registry) return;
  const project = findProject(registry, config.activeProjectSlug);
  if (!project) return;
  const next = prefs.godotProjectRoot.trim() || null;
  if (project.godotProjectRoot === next) return;
  project.godotProjectRoot = next;
  project.lastOpened = new Date().toISOString();
  writeRegistry(config.bleepforgeRoot, registry);
}

export const preferencesRouter = Router();

preferencesRouter.get("/", async (_req, res) => {
  res.json(await read());
});

preferencesRouter.put("/", async (req, res) => {
  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  const saved = await write(parsed.data);
  writeGodotRootThrough(saved);
  res.json({ entity: saved, tresWrite: { attempted: false } });
});
