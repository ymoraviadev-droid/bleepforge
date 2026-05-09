// Bleepforge server composition. Exports startServer() so callers (the dev
// CLI entry in index.ts; Electron main in prod) can await a fully-listening
// server. Boot order:
//   1. Build the express app: storages → routes → static + SPA fallback.
//   2. Listen on config.port.
//   3. Run boot reconcile + asset cache + start the .tres watcher (only if
//      a Godot project root is configured — otherwise we run in "limp
//      mode" so the Preferences UI still works for setting one).
//
// Heavy lifting lives in the modules below; this file's job is wiring.

import express from "express";
import fs from "node:fs";
import path from "node:path";
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

export interface StartedServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

// Seed the Help library from the binary's bundled seed dir if the user's
// help dir is missing or empty. Bleepforge ships its built-in help
// content (the 56 entries authored alongside the app itself) inside
// app.asar at <BLEEPFORGE_SEED_ROOT>/help; on a fresh install with a
// blank userData dir, this copies it into <dataRoot>/help so the user
// has documentation out of the box. The Codex and Concept doc are
// intentionally NOT seeded — those are user-authored content for their
// project, not built-in.
//
// Idempotent: runs only when the destination is absent or empty, so
// subsequent launches don't overwrite the user's edits to help entries.
function seedHelpLibrary(): void {
  const seedRoot = process.env.BLEEPFORGE_SEED_ROOT;
  if (!seedRoot) return;
  const seedHelp = path.join(seedRoot, "help");
  if (!fs.existsSync(seedHelp)) return;
  const destHelp = folderAbs.help;
  const alreadyHas =
    fs.existsSync(destHelp) && fs.readdirSync(destHelp).length > 0;
  if (alreadyHas) return;
  // Manual recursive copy: fs.cpSync uses opendirSync internally which
  // doesn't work inside Electron's asar virtual filesystem (ENOTDIR).
  // readdirSync + copyFileSync are both supported by Electron's asar
  // polyfill, so we walk the tree ourselves.
  copyDirRecursive(seedHelp, destHelp);
  console.log(`[bleepforge/server] seeded help library: ${seedHelp} → ${destHelp}`);
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

export async function startServer(): Promise<StartedServer> {
  seedHelpLibrary();

  if (!config.godotProjectRoot) {
    // Soft-fail in packaged mode: keep listening so the Preferences UI
    // (which doesn't need a Godot root to function) can collect one.
    // Reconcile / asset cache / watcher all skip until a root is set + the
    // server restarts.
    console.error("[bleepforge/server] No Godot project root configured.");
    console.error(
      "[bleepforge/server] Open Preferences and pick your project's root,",
    );
    console.error(
      "[bleepforge/server] then restart Bleepforge. Until then most features",
    );
    console.error("[bleepforge/server] will be empty.");
  }

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
      godotProjectRoot: config.godotProjectRoot,
      godotProjectRootSource: config.godotProjectRootSource,
    });
  });

  // Static client bundle + SPA fallback (prod only). In dev, Vite serves
  // the client on :5173 and proxies /api here; in packaged mode the
  // BrowserWindow loads http://localhost:<port>/ directly from Express,
  // so Express has to ship the React app too. The bundle path is set by
  // the caller (Electron main passes the asar-relative dist path) via
  // BLEEPFORGE_CLIENT_DIST. Absent → no static serving (dev shape).
  const clientDist = process.env.BLEEPFORGE_CLIENT_DIST;
  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback. Read index.html once into memory and send the buffer
    // directly — `res.sendFile` goes through the `send` package which
    // uses fs.stat in a way that fails inside Electron's asar virtual
    // filesystem (NotFoundError on every popout's /diagnostics or /help
    // route, even though the file IS there). The HTML is tiny (<1KB),
    // so loading it once at startup is cheaper than re-resolving it per
    // request anyway.
    const indexHtmlPath = path.join(clientDist, "index.html");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      if (req.path.startsWith("/api/")) return next();
      res.type("html").send(indexHtml);
    });
    console.log(`[bleepforge/server] serving client from: ${clientDist}`);
  }

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(config.port, async () => {
      // Read the actual bound port from the server. When config.port=0
      // (random free port — the packaged path uses this so multiple
      // Bleepforge instances can coexist), config.port is still 0 here;
      // address() returns the real OS-assigned port number.
      const addr = httpServer.address();
      const port =
        typeof addr === "object" && addr !== null ? addr.port : config.port;
      const url = `http://localhost:${port}`;
      console.log(`[bleepforge/server] ${url}`);
      console.log(`[bleepforge/server] data root:  ${config.dataRoot}`);
      console.log(`[bleepforge/server] asset root: ${config.assetRoot}`);
      if (config.godotProjectRoot) {
        console.log(
          `[bleepforge/server] godot root: ${config.godotProjectRoot} (from ${config.godotProjectRootSource})`,
        );
        await runBootReconcile();
        // Build the image-asset cache once before the watcher starts, so
        // the gallery has full data on first paint. Cheap (<100ms).
        await rebuildAssetCache();
        startTresWatcher();
      } else {
        console.warn(
          `[bleepforge/server] limp mode: no Godot root → skipping reconcile, asset cache, watcher`,
        );
      }
      resolve({
        port,
        url,
        close: () =>
          new Promise((res2, rej2) =>
            httpServer.close((err) => (err ? rej2(err) : res2())),
          ),
      });
    });
    httpServer.on("error", reject);
  });
}
