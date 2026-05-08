// Bleepforge server entry. Boot order:
//   1. Install log capture (FIRST — must precede any other import that
//      logs at module load, so Diagnostics → Logs sees boot lines).
//   2. Validate config (fail fast if no Godot project root).
//   3. Build the express app: storages → routes.
//   4. Listen, then run the boot reconcile, then start the .tres watcher.
//
// Heavy lifting lives in the modules below; this file's job is wiring.

import "./lib/logs/buffer.js";

import express from "express";
import {
  FactionDataSchema,
  ItemSchema,
  KarmaImpactSchema,
  NpcSchema,
  QuestSchema,
} from "@bleepforge/shared";
import { config, folderAbs } from "./config.js";
import { assetRouter } from "./lib/asset/router.js";
import { assetsRouter } from "./lib/assets/router.js";
import { rebuildAssetCache } from "./lib/assets/cache.js";
import { balloonRouter } from "./features/balloon/router.js";
import { codexRouter } from "./features/codex/router.js";
import { conceptRouter } from "./features/concept/router.js";
import { dialogRouter } from "./features/dialog/router.js";
import { godotProjectRouter } from "./lib/godotProject/router.js";
import { helpRouter } from "./features/help/router.js";
import { itemIconRouter } from "./features/item/iconRouter.js";
import { logsRouter } from "./lib/logs/router.js";
import { pickupsRouter } from "./lib/pickup/router.js";
import { preferencesRouter } from "./features/preferences/router.js";
import { processRouter } from "./lib/process/router.js";
import { runBootReconcile } from "./lib/reconcile/bootReconcile.js";
import { reconcileRouter } from "./lib/reconcile/router.js";
import { savesRouter } from "./lib/saves/router.js";
import { syncRouter } from "./lib/sync/router.js";
import { makeCrudRouter, makeJsonStorage } from "./lib/util/jsonCrud.js";
import { startTresWatcher } from "./internal/tres/watcher.js";
import { watcherRouter } from "./internal/tres/watcherRouter.js";
import {
  writeFactionTres,
  writeItemTres,
  writeKarmaTres,
  writeNpcTres,
  writeQuestTres,
} from "./internal/tres/writer.js";

// ---- 2. Fail-fast on missing Godot project root --------------------------
// Bleepforge is a tool for the Flock of Bleeps Godot project. .tres is
// canonical; data/ JSONs are a derived cache rebuilt from it on boot.
// Without a project root there's nothing to read or write — refuse to
// start so the failure mode is obvious instead of "everything's empty
// and I don't know why." Resolution order: preferences.json → env → fail.
if (!config.godotProjectRoot) {
  console.error("[bleepforge/server] No Godot project root configured.");
  console.error(
    "[bleepforge/server] Set GODOT_PROJECT_ROOT in .env, or open Preferences",
  );
  console.error(
    "[bleepforge/server] in a previous run to point at your project.",
  );
  process.exit(1);
}

// ---- 3. Build the express app -------------------------------------------
const app = express();
app.use(express.json({ limit: "5mb" }));

// JSON-backed storages for the five flat-domain entities. Folder-aware
// domains (Dialogs, Balloons) ship their own storage modules under
// features/<domain>/storage.ts because their layout is per-folder and
// can't be expressed as a single `keyField`.
const questStorage = makeJsonStorage(QuestSchema, folderAbs.quest, "Id");
const itemStorage = makeJsonStorage(ItemSchema, folderAbs.item, "Slug");
const karmaStorage = makeJsonStorage(KarmaImpactSchema, folderAbs.karma, "Id");
const npcStorage = makeJsonStorage(NpcSchema, folderAbs.npc, "NpcId");
const factionStorage = makeJsonStorage(
  FactionDataSchema,
  folderAbs.faction,
  "Faction",
);

// Game-domain CRUD endpoints — folder-aware ones first, then the five
// flat-domain ones via makeCrudRouter (which also threads the domain tag
// into the saves activity feed).
app.use("/api/dialogs", dialogRouter);
app.use("/api/balloons", balloonRouter);
app.use("/api/codex", codexRouter);
app.use("/api/help", helpRouter);
app.use(
  "/api/quests",
  makeCrudRouter(QuestSchema, questStorage, "Id", writeQuestTres, "quest"),
);
app.use(
  "/api/items",
  makeCrudRouter(ItemSchema, itemStorage, "Slug", writeItemTres, "item"),
);
app.use(
  "/api/karma",
  makeCrudRouter(KarmaImpactSchema, karmaStorage, "Id", writeKarmaTres, "karma"),
);
app.use(
  "/api/npcs",
  makeCrudRouter(NpcSchema, npcStorage, "NpcId", writeNpcTres, "npc"),
);
app.use(
  "/api/factions",
  makeCrudRouter(
    FactionDataSchema,
    factionStorage,
    "Faction",
    writeFactionTres,
    "faction",
  ),
);

// Non-domain endpoints — singletons, infrastructure, observability.
app.use("/api/asset", assetRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/item-icon", itemIconRouter);
app.use("/api/sync", syncRouter);
app.use("/api/concept", conceptRouter);
app.use("/api/preferences", preferencesRouter);
app.use("/api/pickups", pickupsRouter);
app.use("/api/godot-project", godotProjectRouter);
app.use("/api/reconcile", reconcileRouter);
app.use("/api/logs", logsRouter);
app.use("/api/process", processRouter);
app.use("/api/watcher", watcherRouter);
app.use("/api/saves", savesRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    dataRoot: config.dataRoot,
    assetRoot: config.assetRoot,
    folders: folderAbs,
    devMode: config.devMode,
  });
});

// ---- 4. Listen + boot reconcile + start watcher --------------------------
app.listen(config.port, async () => {
  console.log(`[bleepforge/server] http://localhost:${config.port}`);
  console.log(`[bleepforge/server] data root:  ${config.dataRoot}`);
  console.log(`[bleepforge/server] asset root: ${config.assetRoot}`);
  console.log(
    `[bleepforge/server] godot root: ${config.godotProjectRoot} (from ${config.godotProjectRootSource})`,
  );

  await runBootReconcile();
  // Build the image-asset cache once before the watcher starts, so the
  // gallery has full data on first paint. Cheap on this corpus (<100ms).
  await rebuildAssetCache();
  startTresWatcher();
});
