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
import crypto from "node:crypto";
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
import { projectIndex } from "./lib/projectIndex/index.js";
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
import { rebuildShaderCache } from "./lib/shaders/cache.js";
import { shadersRouter } from "./lib/shaders/router.js";
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

// Seed the Help library from the binary's bundled seed dir into the user's
// help dir. Bleepforge ships its built-in help content (the entries authored
// alongside the app itself) inside app.asar at <BLEEPFORGE_SEED_ROOT>/help.
//
// Three classes of behavior, decided per file via a hash manifest at
// <userData root>/.bleepforge-seed-manifest.json:
//
//   1. Fresh install (userData/help missing or empty) — copy the whole seed
//      tree and write the manifest with every seed file's current hash.
//      Sets the baseline for future "user-edited vs untouched" checks.
//
//   2. Upgrade with manifest — for each seed file:
//      - userData missing the file        → copy seed (new entry shipped)
//      - userData hash === seed hash      → no-op (already up to date)
//      - userData hash === manifest hash  → user hasn't touched it since
//                                           last seed; safe to overwrite
//                                           with the new seed content
//                                           (content update propagated)
//      - userData hash differs from both  → user has edited; preserve
//
//   3. Upgrade WITHOUT manifest (pre-v0.2.1 install) — same as today's
//      legacy behavior: copy missing files, preserve everything that
//      exists. The first run after the upgrade populates the manifest
//      so the NEXT upgrade can propagate content updates cleanly.
//
// The manifest itself records the hashes of the seed content we last
// shipped (not the user's). That's what lets us tell "user changed this"
// from "user accepted this and we now want to update it."
//
// Deletions from the seed are intentionally NOT propagated — if a help
// entry is removed in a future version, the user's stale copy lingers
// harmlessly. Could be added later with a "last-seeded paths" tracker
// + delete-prompt; out of scope today.
//
// The Codex and Concept docs are intentionally NOT seeded — those are
// user-authored content for their project, not built-in.

interface SeedManifest {
  /** Map from seed-relative path (e.g. "getting-started/welcome.json") to
   *  the sha256 of the seed content we last shipped to this user. */
  help: Record<string, string>;
}

function seedManifestPath(): string {
  // Manifest lives at the Bleepforge install root (one above the projects/
  // tree), NOT at the per-project level. The help seed itself currently
  // lands inside each project's data/help/ (the v0.2.6 migration moved it
  // there with the rest of data/) but the manifest tracks "what version of
  // the help library did we last ship to this user" — an app-level
  // concern. Hoisting help out of per-project storage is a phase-5 follow-up.
  return path.join(config.bleepforgeRoot, ".bleepforge-seed-manifest.json");
}

function loadSeedManifest(): SeedManifest {
  try {
    const text = fs.readFileSync(seedManifestPath(), "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.help && typeof parsed.help === "object") {
      return parsed as SeedManifest;
    }
  } catch {
    // ENOENT or malformed — fall through to empty. Without a baseline we
    // treat every existing file as user-edited (conservative; matches
    // pre-manifest behavior).
  }
  return { help: {} };
}

function saveSeedManifest(manifest: SeedManifest): void {
  const file = seedManifestPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2), "utf8");
  } catch (err) {
    // Non-fatal: seed itself succeeded, the user just won't get update
    // propagation on the next upgrade until the manifest writes succeed.
    console.warn(
      `[bleepforge/server] could not write seed manifest at ${file}: ${(err as Error).message}`,
    );
  }
}

function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function seedHelpLibrary(): void {
  const seedRoot = process.env.BLEEPFORGE_SEED_ROOT;
  if (!seedRoot) return;
  const seedHelp = path.join(seedRoot, "help");
  if (!fs.existsSync(seedHelp)) return;
  const destHelp = folderAbs.help;
  const isFreshInstall =
    !fs.existsSync(destHelp) || fs.readdirSync(destHelp).length === 0;

  if (isFreshInstall) {
    // Manual recursive copy: fs.cpSync uses opendirSync internally which
    // doesn't work inside Electron's asar virtual filesystem (ENOTDIR).
    // readdirSync + copyFileSync are both supported by Electron's asar
    // polyfill, so we walk the tree ourselves.
    copyDirRecursive(seedHelp, destHelp);
    const manifest: SeedManifest = { help: hashSeedTree(seedHelp) };
    saveSeedManifest(manifest);
    console.log(`[bleepforge/server] seeded help library: ${seedHelp} → ${destHelp}`);
    return;
  }

  // Upgrade path: add new files + update untouched ones + preserve edits.
  const manifest = loadSeedManifest();
  const lastSeed = manifest.help;
  const newSeed: Record<string, string> = {};

  const counts = { added: 0, updated: 0, preserved: 0 };
  mergeSeedTree(seedHelp, destHelp, lastSeed, newSeed, "", counts);

  // Persist the manifest with the seed hashes we just shipped — sets the
  // baseline for the NEXT upgrade to detect what's user-edited.
  manifest.help = newSeed;
  saveSeedManifest(manifest);

  const parts: string[] = [];
  if (counts.added > 0) parts.push(`${counts.added} new`);
  if (counts.updated > 0) parts.push(`${counts.updated} updated`);
  if (counts.preserved > 0) parts.push(`${counts.preserved} preserved`);
  if (parts.length > 0) {
    console.log(`[bleepforge/server] help library merge: ${parts.join(", ")} (${destHelp})`);
  }
}

/** Walk the seed tree, comparing each file against (a) the user's current
 *  copy and (b) the last-seeded hash from the manifest. Per-file rules in
 *  the seedHelpLibrary doc-comment. Recursively descends; `newSeed` and
 *  `counts` accumulate as we go. */
function mergeSeedTree(
  srcDir: string,
  dstDir: string,
  lastSeed: Record<string, string>,
  newSeed: Record<string, string>,
  relBase: string,
  counts: { added: number; updated: number; preserved: number },
): void {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      mergeSeedTree(s, d, lastSeed, newSeed, rel, counts);
      continue;
    }
    if (!entry.isFile()) continue;

    const seedContent = fs.readFileSync(s);
    const seedHash = sha256(seedContent);
    newSeed[rel] = seedHash;

    if (!fs.existsSync(d)) {
      // New file shipped in this seed.
      fs.writeFileSync(d, seedContent);
      counts.added++;
      continue;
    }

    const userContent = fs.readFileSync(d);
    const userHash = sha256(userContent);
    if (userHash === seedHash) {
      // Already up to date — no-op.
      continue;
    }

    const lastHash = lastSeed[rel];
    if (lastHash && userHash === lastHash) {
      // User hasn't touched it since the last seed; seed has new content.
      // Safe to overwrite — content update propagates.
      fs.writeFileSync(d, seedContent);
      counts.updated++;
    } else {
      // User has edited (or no baseline → conservative). Preserve.
      counts.preserved++;
    }
  }
}

/** Compute sha256 of every file in `root`, keyed by relative path. Used
 *  to populate the manifest on fresh install. */
function hashSeedTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  function walk(dir: string, relBase: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) out[rel] = sha256(fs.readFileSync(abs));
    }
  }
  walk(root, "");
  return out;
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
  app.use("/api/shaders", shadersRouter);
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
        // Project-index FIRST — every downstream "find this entity's
        // .tres" path (reconcile, watcher reimports, writer save-back,
        // icon resolution, pickup catalog) reads from it. Content-driven
        // classification means moving files around in the Godot project
        // doesn't break Bleepforge (until/unless we add a domain whose
        // identity isn't extractable from the file's body).
        const stats = await projectIndex.build(config.godotProjectRoot);
        console.log(
          `[bleepforge/server] project index: ${stats.tresCount} .tres + ${stats.pickupCount} pickup .tscn in ${stats.durationMs}ms (${stats.filesVisited} files visited)`,
        );
        await runBootReconcile();
        // Build the image-asset + shader caches once before the watcher
        // starts, so both galleries have full data on first paint and the
        // watcher's first delta event lands on a populated map. Cheap
        // (<100ms each; shader walk is even quicker — single-digit files).
        await rebuildAssetCache();
        await rebuildShaderCache();
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
