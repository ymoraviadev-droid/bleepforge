import { Router } from "express";
import { z } from "zod";
import { runImport } from "./orchestrator.js";

export const importRouter: Router = Router();

const ImportRequest = z.object({
  godotProjectRoot: z.string().min(1),
  dryRun: z.boolean().optional(),
});

importRouter.post("/", async (req, res) => {
  const parsed = ImportRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  try {
    const result = await runImport(parsed.data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
