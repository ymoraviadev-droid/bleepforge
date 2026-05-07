import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { ConceptSchema, emptyConcept, type Concept } from "@bleepforge/shared";
import { config } from "../config.js";

// Singleton document — one `data/concept.json` for the whole project.
// No id, no list, no .tres pipeline. Just GET (with empty fallback) + PUT.

const conceptFile = path.join(config.dataRoot, "concept.json");

async function read(): Promise<Concept> {
  try {
    const raw = await fs.readFile(conceptFile, "utf8");
    return ConceptSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyConcept();
    throw err;
  }
}

async function write(c: Concept): Promise<Concept> {
  const validated = ConceptSchema.parse(c);
  await fs.mkdir(path.dirname(conceptFile), { recursive: true });
  await fs.writeFile(conceptFile, JSON.stringify(validated, null, 2), "utf8");
  return validated;
}

export const conceptRouter = Router();

conceptRouter.get("/", async (_req, res) => {
  res.json(await read());
});

conceptRouter.put("/", async (req, res) => {
  const parsed = ConceptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  const saved = await write(parsed.data);
  res.json({ entity: saved, tresWrite: { attempted: false } });
});
