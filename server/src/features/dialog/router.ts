import { Router } from "express";
import { DialogSequenceSchema } from "@bleepforge/shared";
import * as storage from "./storage.js";
import { recordSave } from "../../lib/saves/buffer.js";
import type { TresWriteResult } from "../../internal/tres/writer.js";
import { writeTres } from "../../internal/tres/generic/writer.js";

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
  const folder = req.params.folder;
  const saved = await storage.write(folder, parsed.data);
  let tresWrite: TresWriteResult = { attempted: false };
  try {
    tresWrite = await writeTres("dialog", saved, { folder });
  } catch (err) {
    tresWrite = { attempted: true, ok: false, error: String(err) };
  }
  if (tresWrite.attempted) {
    if (tresWrite.ok) {
      const w = tresWrite.warnings && tresWrite.warnings.length > 0
        ? ` (${tresWrite.warnings.length} warnings)`
        : "";
      console.log(`[tres-write] OK dialog ${folder}/${saved.Id} -> ${tresWrite.path}${w}`);
      if (tresWrite.warnings) {
        for (const wn of tresWrite.warnings) console.log(`  ! ${wn}`);
      }
    } else {
      console.log(`[tres-write] FAIL dialog ${folder}/${saved.Id}: ${tresWrite.error}`);
    }
    recordSave({
      ts: new Date().toISOString(),
      direction: "outgoing",
      domain: "dialog",
      key: `${folder}/${saved.Id}`,
      action: "updated",
      outcome: tresWrite.ok
        ? tresWrite.warnings && tresWrite.warnings.length > 0
          ? "warning"
          : "ok"
        : "error",
      path: tresWrite.path,
      warnings: tresWrite.warnings,
      error: tresWrite.error,
    });
  }
  res.json({ entity: saved, tresWrite });
});

dialogRouter.delete("/:folder/:id", async (req, res) => {
  const deleted = await storage.remove(req.params.folder, req.params.id);
  res.status(deleted ? 204 : 404).end();
});
