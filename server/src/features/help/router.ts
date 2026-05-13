import { Router } from "express";
import * as storage from "./storage.js";

// HTTP surface for the in-app Help feature. Read-only: GET endpoints serve
// content; there is no writeback path. Help content is authored directly
// in the JSON files under `data/help/` (and seeded into userData from the
// asar-bundled `seed/help/` on first launch).

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
