import express from "express";
import {
  ItemSchema,
  KarmaImpactSchema,
  NpcSchema,
  QuestSchema,
} from "@bleepforge/shared";
import { config, folderAbs } from "./config.js";
import { assetRouter } from "./asset/router.js";
import { dialogRouter } from "./dialog/router.js";
import { makeCrudRouter, makeJsonStorage } from "./util/jsonCrud.js";

const app = express();
app.use(express.json({ limit: "5mb" }));

const questStorage = makeJsonStorage(QuestSchema, folderAbs.quest, "Id");
const itemStorage = makeJsonStorage(ItemSchema, folderAbs.item, "Slug");
const karmaStorage = makeJsonStorage(KarmaImpactSchema, folderAbs.karma, "Id");
const npcStorage = makeJsonStorage(NpcSchema, folderAbs.npc, "NpcId");

app.use("/api/dialogs", dialogRouter);
app.use("/api/quests", makeCrudRouter(QuestSchema, questStorage, "Id"));
app.use("/api/items", makeCrudRouter(ItemSchema, itemStorage, "Slug"));
app.use("/api/karma", makeCrudRouter(KarmaImpactSchema, karmaStorage, "Id"));
app.use("/api/npcs", makeCrudRouter(NpcSchema, npcStorage, "NpcId"));
app.use("/api/asset", assetRouter);

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
});
