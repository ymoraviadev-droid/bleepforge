import { Router } from "express";
import { BalloonSchema } from "@bleepforge/shared";
import * as storage from "./storage.js";
import { recordSave } from "../../lib/saves/buffer.js";
import { writeBalloonTres, type TresWriteResult } from "../../internal/tres/writer.js";

// Folder-aware HTTP surface for the Balloons domain. Mirrors dialog/router.ts.
// The PUT handler also writes back to the matching .tres in the Godot project
// and records both flows (success / warning / error) into the Saves feed.

export const balloonRouter: Router = Router();

balloonRouter.get("/folders", async (_req, res) => {
  res.json(await storage.listFolders());
});

balloonRouter.get("/", async (_req, res) => {
  res.json(await storage.listAll());
});

balloonRouter.get("/:folder", async (req, res) => {
  res.json(await storage.listInFolder(req.params.folder));
});

balloonRouter.get("/:folder/:id", async (req, res) => {
  const b = await storage.read(req.params.folder, req.params.id);
  if (!b) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(b);
});

balloonRouter.put("/:folder/:id", async (req, res) => {
  const parsed = BalloonSchema.safeParse(req.body);
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
    tresWrite = await writeBalloonTres(folder, saved);
  } catch (err) {
    tresWrite = { attempted: true, ok: false, error: String(err) };
  }
  if (tresWrite.attempted) {
    if (tresWrite.ok) {
      const w =
        tresWrite.warnings && tresWrite.warnings.length > 0
          ? ` (${tresWrite.warnings.length} warnings)`
          : "";
      console.log(
        `[tres-write] OK balloon ${folder}/${saved.Id} -> ${tresWrite.path}${w}`,
      );
      if (tresWrite.warnings) {
        for (const wn of tresWrite.warnings) console.log(`  ! ${wn}`);
      }
    } else {
      console.log(
        `[tres-write] FAIL balloon ${folder}/${saved.Id}: ${tresWrite.error}`,
      );
    }
    recordSave({
      ts: new Date().toISOString(),
      direction: "outgoing",
      domain: "balloon",
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

balloonRouter.delete("/:folder/:id", async (req, res) => {
  const deleted = await storage.remove(req.params.folder, req.params.id);
  res.status(deleted ? 204 : 404).end();
});
