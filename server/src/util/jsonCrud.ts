import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { z } from "zod";
import { recordSave } from "../saves/buffer.js";
import type { SaveOutcome } from "../saves/eventBus.js";
import type { SyncDomain } from "../sync/eventBus.js";
import type { TresWriteResult } from "../tres/writer.js";

export interface JsonStorage<T> {
  list: () => Promise<T[]>;
  read: (key: string) => Promise<T | null>;
  write: (entity: T) => Promise<T>;
  delete: (key: string) => Promise<boolean>;
}

export function makeJsonStorage<S extends z.ZodTypeAny>(
  schema: S,
  folder: string,
  keyField: string,
): JsonStorage<z.infer<S>> {
  type T = z.infer<S>;
  const fileFor = (key: string) => path.join(folder, `${key}.json`);
  const tag = path.basename(folder);

  return {
    list: async () => {
      let entries: string[];
      try {
        entries = await fs.readdir(folder);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
      const out: T[] = [];
      for (const name of entries) {
        if (!name.endsWith(".json")) continue;
        try {
          const raw = await fs.readFile(path.join(folder, name), "utf8");
          out.push(schema.parse(JSON.parse(raw)));
        } catch (err) {
          console.warn(`[${tag}] skipping ${name}: ${(err as Error).message}`);
        }
      }
      return out;
    },

    read: async (key) => {
      try {
        const raw = await fs.readFile(fileFor(key), "utf8");
        return schema.parse(JSON.parse(raw));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    write: async (entity) => {
      const validated = schema.parse(entity);
      const key = (validated as Record<string, unknown>)[keyField];
      if (typeof key !== "string" || key.length === 0) {
        throw new Error(`entity has no ${keyField}`);
      }
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(fileFor(key), JSON.stringify(validated, null, 2), "utf8");
      return validated;
    },

    delete: async (key) => {
      try {
        await fs.unlink(fileFor(key));
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw err;
      }
    },
  };
}

export function makeCrudRouter<S extends z.ZodTypeAny>(
  schema: S,
  storage: JsonStorage<z.infer<S>>,
  keyField: string,
  afterWrite?: (entity: z.infer<S>) => Promise<TresWriteResult>,
  // Tag so PUT can record the save into the activity feed. Optional because
  // the sole reason to record is the .tres write: a domain without afterWrite
  // has no save to surface in Diagnostics → Saves.
  domain?: SyncDomain,
): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await storage.list());
  });

  router.get("/:id", async (req, res) => {
    const entity = await storage.read(req.params.id);
    if (!entity) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(entity);
  });

  router.put("/:id", async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.format() });
      return;
    }
    const bodyKey = (parsed.data as Record<string, unknown>)[keyField];
    if (bodyKey !== req.params.id) {
      res.status(400).json({ error: `${keyField} in body does not match URL` });
      return;
    }
    const saved = await storage.write(parsed.data);
    let tresWrite: TresWriteResult = { attempted: false };
    if (afterWrite) {
      try {
        tresWrite = await afterWrite(saved);
      } catch (err) {
        tresWrite = { attempted: true, ok: false, error: String(err) };
      }
      logTresWrite(keyField, saved, tresWrite);
      if (domain && tresWrite.attempted) {
        const key = (saved as Record<string, unknown>)[keyField];
        if (typeof key === "string") {
          recordSave({
            ts: new Date().toISOString(),
            direction: "outgoing",
            domain,
            key,
            action: "updated",
            outcome: outcomeOf(tresWrite),
            path: tresWrite.path,
            warnings: tresWrite.warnings,
            error: tresWrite.error,
          });
        }
      }
    }
    res.json({ entity: saved, tresWrite });
  });

  router.delete("/:id", async (req, res) => {
    const deleted = await storage.delete(req.params.id);
    res.status(deleted ? 204 : 404).end();
  });

  return router;
}

/** Map a writer result to a Saves-tab outcome. Warnings (orphan ext_resource
 *  cleanup, etc.) are non-fatal but worth surfacing distinctly from a clean
 *  save — the user often wants to know "did anything weird happen?" without
 *  having to expand every row. */
function outcomeOf(result: TresWriteResult): SaveOutcome {
  if (!result.ok) return "error";
  if (result.warnings && result.warnings.length > 0) return "warning";
  return "ok";
}

function logTresWrite(
  keyField: string,
  entity: unknown,
  result: TresWriteResult,
): void {
  if (!result.attempted) return;
  const key = (entity as Record<string, unknown>)[keyField];
  if (result.ok) {
    const w = result.warnings && result.warnings.length > 0 ? ` (${result.warnings.length} warnings)` : "";
    console.log(`[tres-write] OK ${keyField}=${key} -> ${result.path}${w}`);
    if (result.warnings) for (const wn of result.warnings) console.log(`  ! ${wn}`);
  } else {
    console.log(`[tres-write] FAIL ${keyField}=${key}: ${result.error}`);
  }
}
