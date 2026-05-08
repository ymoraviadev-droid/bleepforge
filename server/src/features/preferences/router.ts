import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import {
  PreferencesSchema,
  emptyPreferences,
  type Preferences,
} from "@bleepforge/shared";
import { config } from "../../config.js";

// Singleton document — `data/preferences.json`. Holds the user's saved global
// themes (color theme + typography bundle, one per named entry) and the name
// of the currently active one. Mirrors the concept router exactly: GET (with
// empty fallback) + PUT, no list, no .tres pipeline.

const preferencesFile = path.join(config.dataRoot, "preferences.json");

async function read(): Promise<Preferences> {
  try {
    const raw = await fs.readFile(preferencesFile, "utf8");
    return PreferencesSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyPreferences();
    throw err;
  }
}

async function write(p: Preferences): Promise<Preferences> {
  const validated = PreferencesSchema.parse(p);
  await fs.mkdir(path.dirname(preferencesFile), { recursive: true });
  await fs.writeFile(preferencesFile, JSON.stringify(validated, null, 2), "utf8");
  return validated;
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
  res.json({ entity: saved, tresWrite: { attempted: false } });
});
