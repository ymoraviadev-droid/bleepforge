import { Router, type Request, type Response, type NextFunction } from "express";
import {
  HelpCategoryMetaSchema,
  HelpEntrySchema,
} from "@bleepforge/shared";
import { config } from "../../config.js";
import * as storage from "./storage.js";

// HTTP surface for the in-app Help feature. Same folder-aware shape as
// the Codex router: GET endpoints serve content publicly, PUT/DELETE
// endpoints are gated behind the BLEEPFORGE_DEV_MODE env var.
//
// Why server-side gating in addition to client-side: the client can be
// trivially worked around by anyone with curl, so the server must
// enforce the rule independently. Read-only deployments stay read-only
// even if a stale browser tab tries to write.

function requireDevMode(_req: Request, res: Response, next: NextFunction): void {
  if (!config.devMode) {
    res
      .status(403)
      .json({ error: "Help editing is disabled. Set BLEEPFORGE_DEV_MODE=1 to enable." });
    return;
  }
  next();
}

export const helpRouter: Router = Router();

helpRouter.get("/categories", async (_req, res) => {
  res.json(await storage.listCategories());
});

helpRouter.get("/", async (_req, res) => {
  res.json(await storage.listAll());
});

helpRouter.get("/:category/_meta", async (req, res) => {
  const meta = await storage.readMeta(req.params.category);
  if (!meta) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(meta);
});

helpRouter.put("/:category/_meta", requireDevMode, async (req, res) => {
  const parsed = HelpCategoryMetaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  if (parsed.data.Category !== req.params.category) {
    res.status(400).json({ error: "Category in body does not match URL" });
    return;
  }
  const saved = await storage.writeMeta(parsed.data);
  res.json({ entity: saved, tresWrite: { attempted: false } });
});

helpRouter.delete("/:category", requireDevMode, async (req, res) => {
  const deleted = await storage.removeCategory(req.params.category as string);
  res.status(deleted ? 204 : 404).end();
});

helpRouter.get("/:category", async (req, res) => {
  res.json(await storage.listInCategory(req.params.category));
});

helpRouter.get("/:category/:id", async (req, res) => {
  const entry = await storage.readEntry(req.params.category, req.params.id);
  if (!entry) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(entry);
});

helpRouter.put("/:category/:id", requireDevMode, async (req, res) => {
  const parsed = HelpEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  if (parsed.data.Id !== req.params.id) {
    res.status(400).json({ error: "Id in body does not match URL" });
    return;
  }
  try {
    const saved = await storage.writeEntry(req.params.category as string, parsed.data);
    res.json({ entity: saved, tresWrite: { attempted: false } });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

helpRouter.delete("/:category/:id", requireDevMode, async (req, res) => {
  const deleted = await storage.removeEntry(
    req.params.category as string,
    req.params.id as string,
  );
  res.status(deleted ? 204 : 404).end();
});
