import express from "express";
import {
  FactionDataSchema,
  ItemSchema,
  KarmaImpactSchema,
  NpcSchema,
  QuestSchema,
} from "@bleepforge/shared";
import { config, folderAbs } from "./config.js";
import { assetRouter } from "./asset/router.js";
import { conceptRouter } from "./concept/router.js";
import { pickupsRouter } from "./pickup/router.js";
import { preferencesRouter } from "./preferences/router.js";
import { dialogRouter } from "./dialog/router.js";
import { runImport } from "./import/orchestrator.js";
import { itemIconRouter } from "./item/iconRouter.js";
import {
  writeFactionTres,
  writeItemTres,
  writeKarmaTres,
  writeNpcTres,
  writeQuestTres,
} from "./tres/writer.js";
import { startTresWatcher } from "./tres/watcher.js";
import { syncRouter } from "./sync/router.js";
import { makeCrudRouter, makeJsonStorage } from "./util/jsonCrud.js";

// Fail-fast: Bleepforge is a tool for the Flock of Bleeps Godot project. .tres
// is canonical; data/ JSONs are a derived cache rebuilt from it on boot. Without
// a project root there's nothing to read or write — refuse to start so the
// failure mode is obvious instead of "everything's empty and I don't know why."
if (!config.godotProjectRoot) {
  console.error("[bleepforge/server] GODOT_PROJECT_ROOT is required.");
  console.error("[bleepforge/server] Set it in .env to point at your Godot project root.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "5mb" }));

const questStorage = makeJsonStorage(QuestSchema, folderAbs.quest, "Id");
const itemStorage = makeJsonStorage(ItemSchema, folderAbs.item, "Slug");
const karmaStorage = makeJsonStorage(KarmaImpactSchema, folderAbs.karma, "Id");
const npcStorage = makeJsonStorage(NpcSchema, folderAbs.npc, "NpcId");
const factionStorage = makeJsonStorage(FactionDataSchema, folderAbs.faction, "Faction");

app.use("/api/dialogs", dialogRouter);
app.use("/api/quests", makeCrudRouter(QuestSchema, questStorage, "Id", writeQuestTres));
app.use("/api/items", makeCrudRouter(ItemSchema, itemStorage, "Slug", writeItemTres));
app.use("/api/karma", makeCrudRouter(KarmaImpactSchema, karmaStorage, "Id", writeKarmaTres));
app.use("/api/npcs", makeCrudRouter(NpcSchema, npcStorage, "NpcId", writeNpcTres));
app.use(
  "/api/factions",
  makeCrudRouter(FactionDataSchema, factionStorage, "Faction", writeFactionTres),
);
app.use("/api/asset", assetRouter);
app.use("/api/item-icon", itemIconRouter);
app.use("/api/sync", syncRouter);
app.use("/api/concept", conceptRouter);
app.use("/api/preferences", preferencesRouter);
app.use("/api/pickups", pickupsRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    dataRoot: config.dataRoot,
    assetRoot: config.assetRoot,
    folders: folderAbs,
  });
});

app.listen(config.port, async () => {
  console.log(`[bleepforge/server] http://localhost:${config.port}`);
  console.log(`[bleepforge/server] data root:  ${config.dataRoot}`);
  console.log(`[bleepforge/server] asset root: ${config.assetRoot}`);
  console.log(`[bleepforge/server] godot root: ${config.godotProjectRoot}`);

  // Boot-time reconcile: rebuild the JSON cache from .tres so any edits made
  // in Godot while Bleepforge was off are picked up before the first request.
  // Runs after listen so health-check clients aren't blocked, but before the
  // watcher so we don't double-process anything that fires during startup.
  console.log(`[bleepforge/server] reconciling JSON cache from .tres ...`);
  const t0 = Date.now();
  try {
    const result = await runImport({ godotProjectRoot: config.godotProjectRoot! });
    const counts = [
      `items=${result.domains.items.imported.length}`,
      `quests=${result.domains.quests.imported.length}`,
      `karma=${result.domains.karma.imported.length}`,
      `factions=${result.domains.factions.imported.length}`,
      `dialogs=${result.domains.dialogs.imported.length}`,
      `npcs=${result.domains.npcs.imported.length}`,
    ].join(" ");
    console.log(`[bleepforge/server] reconcile ok in ${Date.now() - t0}ms — ${counts}`);
  } catch (err) {
    console.error(`[bleepforge/server] reconcile FAILED: ${(err as Error).message}`);
    console.error(`[bleepforge/server] continuing with whatever JSON is currently on disk`);
  }

  startTresWatcher();
});
