import { Router } from "express";
import {
  CodexCategoryMetaSchema,
  CodexEntrySchema,
} from "@bleepforge/shared";
import * as storage from "./storage.js";

// HTTP surface for the Game Codex domain. Folder-aware (per-category)
// routes mirror the balloon shape, with two extra endpoints for the
// category schema (_meta) and a category-level DELETE.
//
// _meta routes are registered BEFORE the generic /:category/:id pair so
// Express's first-match wins routing picks them up — otherwise GET
// /codex/foo/_meta would resolve to "entry id is _meta" (which storage
// would reject anyway, but the route ordering keeps things clean).
//
// Bleepforge-only — no .tres writeback, no saves-feed integration.

export const codexRouter: Router = Router();

codexRouter.get("/categories", async (_req, res) => {
  res.json(await storage.listCategories());
});

codexRouter.get("/", async (_req, res) => {
  res.json(await storage.listAll());
});

// ---- Per-category meta (schema definition) -------------------------------

codexRouter.get("/:category/_meta", async (req, res) => {
  const meta = await storage.readMeta(req.params.category);
  if (!meta) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(meta);
});

codexRouter.put("/:category/_meta", async (req, res) => {
  const parsed = CodexCategoryMetaSchema.safeParse(req.body);
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

codexRouter.delete("/:category", async (req, res) => {
  const deleted = await storage.removeCategory(req.params.category);
  res.status(deleted ? 204 : 404).end();
});

// ---- Per-category entries ------------------------------------------------

codexRouter.get("/:category", async (req, res) => {
  res.json(await storage.listInCategory(req.params.category));
});

codexRouter.get("/:category/:id", async (req, res) => {
  const entry = await storage.readEntry(req.params.category, req.params.id);
  if (!entry) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(entry);
});

codexRouter.put("/:category/:id", async (req, res) => {
  const parsed = CodexEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  if (parsed.data.Id !== req.params.id) {
    res.status(400).json({ error: "Id in body does not match URL" });
    return;
  }
  try {
    const saved = await storage.writeEntry(req.params.category, parsed.data);
    res.json({ entity: saved, tresWrite: { attempted: false } });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

codexRouter.delete("/:category/:id", async (req, res) => {
  const deleted = await storage.removeEntry(req.params.category, req.params.id);
  res.status(deleted ? 204 : 404).end();
});
