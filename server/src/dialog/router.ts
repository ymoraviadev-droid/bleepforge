import { Router } from "express";
import { DialogSequenceSchema } from "@bleepforge/shared";
import * as storage from "./storage.js";

export const dialogRouter: Router = Router();

dialogRouter.get("/folders", async (_req, res) => {
  res.json(await storage.listFolders());
});

dialogRouter.get("/", async (_req, res) => {
  res.json(await storage.listAll());
});

dialogRouter.get("/:folder", async (req, res) => {
  res.json(await storage.listInFolder(req.params.folder));
});

dialogRouter.get("/:folder/_layout", async (req, res) => {
  res.json(await storage.readLayout(req.params.folder));
});

dialogRouter.put("/:folder/_layout", async (req, res) => {
  const parsed = storage.LayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  res.json(await storage.writeLayout(req.params.folder, parsed.data));
});

dialogRouter.get("/:folder/:id", async (req, res) => {
  const seq = await storage.read(req.params.folder, req.params.id);
  if (!seq) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(seq);
});

dialogRouter.put("/:folder/:id", async (req, res) => {
  const parsed = DialogSequenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  if (parsed.data.Id !== req.params.id) {
    res.status(400).json({ error: "Id in body does not match URL" });
    return;
  }
  res.json(await storage.write(req.params.folder, parsed.data));
});

dialogRouter.delete("/:folder/:id", async (req, res) => {
  const deleted = await storage.remove(req.params.folder, req.params.id);
  res.status(deleted ? 204 : 404).end();
});
