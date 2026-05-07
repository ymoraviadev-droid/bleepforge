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
import { importRouter } from "./import/router.js";
import { itemIconRouter } from "./item/iconRouter.js";
import {
  shouldWriteTres,
  writeFactionTres,
  writeItemTres,
  writeKarmaTres,
  writeNpcTres,
  writeQuestTres,
} from "./tres/writer.js";
import { shouldWatchTres, startTresWatcher } from "./tres/watcher.js";
import { syncRouter } from "./sync/router.js";
import { makeCrudRouter, makeJsonStorage } from "./util/jsonCrud.js";

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
app.use("/api/import", importRouter);
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

app.listen(config.port, () => {
  console.log(`[bleepforge/server] http://localhost:${config.port}`);
  console.log(`[bleepforge/server] data root:  ${config.dataRoot}`);
  console.log(`[bleepforge/server] asset root: ${config.assetRoot}`);
  if (config.godotProjectRoot) {
    console.log(`[bleepforge/server] godot root: ${config.godotProjectRoot}`);
  }
  console.log(
    `[bleepforge/server] tres write-back: ${shouldWriteTres() ? "ENABLED (WRITE_TRES=1)" : "disabled (set WRITE_TRES=1 to enable)"}`,
  );
  console.log(
    `[bleepforge/server] tres watcher:    ${shouldWatchTres() ? "ENABLED (WATCH_TRES=1)" : "disabled (set WATCH_TRES=1 to enable)"}`,
  );
  startTresWatcher();
});
