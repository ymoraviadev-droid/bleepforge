// Log capture is set up at module load — must be the FIRST import so any
// console.* calls fired during the rest of the boot sequence get captured
// and surfaced in the Diagnostics → Logs tab.
import "./logs/buffer.js";

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
import { godotProjectRouter } from "./godotProject/router.js";
import { runImport } from "./import/orchestrator.js";
import { logsRouter } from "./logs/router.js";
import { processRouter } from "./process/router.js";
import { reconcileRouter, setReconcileStatus } from "./reconcile/router.js";
import { itemIconRouter } from "./item/iconRouter.js";
import {
  writeFactionTres,
  writeItemTres,
  writeKarmaTres,
  writeNpcTres,
  writeQuestTres,
} from "./tres/writer.js";
import { startTresWatcher } from "./tres/watcher.js";
import { watcherRouter } from "./tres/watcherRouter.js";
import { syncRouter } from "./sync/router.js";
import { makeCrudRouter, makeJsonStorage } from "./util/jsonCrud.js";

// Fail-fast: Bleepforge is a tool for the Flock of Bleeps Godot project. .tres
// is canonical; data/ JSONs are a derived cache rebuilt from it on boot. Without
// a project root there's nothing to read or write — refuse to start so the
// failure mode is obvious instead of "everything's empty and I don't know why."
// Resolution order is preferences.json → GODOT_PROJECT_ROOT env var → fail.
if (!config.godotProjectRoot) {
  console.error("[bleepforge/server] No Godot project root configured.");
  console.error("[bleepforge/server] Set GODOT_PROJECT_ROOT in .env, or open Preferences");
  console.error("[bleepforge/server] in a previous run to point at your project.");
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
app.use("/api/godot-project", godotProjectRouter);
app.use("/api/reconcile", reconcileRouter);
app.use("/api/logs", logsRouter);
app.use("/api/process", processRouter);
app.use("/api/watcher", watcherRouter);

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
  console.log(
    `[bleepforge/server] godot root: ${config.godotProjectRoot} (from ${config.godotProjectRootSource})`,
  );

  // Boot-time reconcile: rebuild the JSON cache from .tres so any edits made
  // in Godot while Bleepforge was off are picked up before the first request.
  // Runs after listen so health-check clients aren't blocked, but before the
  // watcher so we don't double-process anything that fires during startup.
  // The result is stashed for /api/reconcile/status so the client header can
  // surface skip/error counts (otherwise a single broken .tres silently leaves
  // one domain with stale JSON and the UI gives no signal).
  console.log(`[bleepforge/server] reconciling JSON cache from .tres ...`);
  const t0 = Date.now();
  try {
    const result = await runImport({ godotProjectRoot: config.godotProjectRoot! });
    const durationMs = Date.now() - t0;

    const errorDetails: { domain: string; file: string; error: string }[] = [];
    const skippedDetails: { domain: string; file: string; reason: string }[] = [];
    for (const dom of ["items", "quests", "karma", "factions", "npcs"] as const) {
      for (const e of result.domains[dom].errors) {
        errorDetails.push({ domain: dom, file: e.file, error: e.error });
      }
      for (const s of result.domains[dom].skipped) {
        skippedDetails.push({ domain: dom, file: s.file, reason: s.reason });
      }
    }
    for (const e of result.domains.dialogs.errors) {
      errorDetails.push({ domain: "dialogs", file: e.file, error: e.error });
    }
    for (const s of result.domains.dialogs.skipped) {
      skippedDetails.push({ domain: "dialogs", file: s.file, reason: s.reason });
    }

    const perDomain = {
      items: countsOf(result.domains.items.imported.length, result.domains.items.skipped.length, result.domains.items.errors.length),
      quests: countsOf(result.domains.quests.imported.length, result.domains.quests.skipped.length, result.domains.quests.errors.length),
      karma: countsOf(result.domains.karma.imported.length, result.domains.karma.skipped.length, result.domains.karma.errors.length),
      factions: countsOf(result.domains.factions.imported.length, result.domains.factions.skipped.length, result.domains.factions.errors.length),
      dialogs: countsOf(result.domains.dialogs.imported.length, result.domains.dialogs.skipped.length, result.domains.dialogs.errors.length),
      npcs: countsOf(result.domains.npcs.imported.length, result.domains.npcs.skipped.length, result.domains.npcs.errors.length),
    };

    setReconcileStatus({
      ranAt: new Date().toISOString(),
      durationMs,
      ok: true,
      perDomain,
      errorDetails,
      skippedDetails,
    });

    // Compact one-liner. Per-domain segment looks like `dialogs=43` when clean
    // and `dialogs=42 (skipped:1)` or `quests=3 (errors:1)` when not, so
    // anomalies pop without drowning the log on a healthy boot.
    const segments: string[] = [];
    for (const [name, c] of Object.entries(perDomain)) {
      const tags: string[] = [];
      if (c.skipped > 0) tags.push(`skipped:${c.skipped}`);
      if (c.errors > 0) tags.push(`errors:${c.errors}`);
      segments.push(tags.length === 0 ? `${name}=${c.imported}` : `${name}=${c.imported} (${tags.join(",")})`);
    }
    console.log(`[bleepforge/server] reconcile ok in ${durationMs}ms — ${segments.join(" ")}`);
    // Per-file detail lines: use console.error / console.warn so the log
    // buffer tags them correctly (Diagnostics → Logs filters by level).
    // The Reconcile tab is the canonical surface for these — Logs is just
    // the aggregated stream.
    for (const e of errorDetails) {
      console.error(`[bleepforge/server]   error: ${e.domain} ${e.file} — ${e.error}`);
    }
    for (const s of skippedDetails) {
      console.warn(`[bleepforge/server]   skipped: ${s.domain} ${s.file} — ${s.reason}`);
    }
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[bleepforge/server] reconcile FAILED: ${message}`);
    console.error(`[bleepforge/server] continuing with whatever JSON is currently on disk`);
    setReconcileStatus({
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      ok: false,
      perDomain: emptyPerDomain(),
      errorDetails: [],
      skippedDetails: [],
      error: message,
    });
  }

  startTresWatcher();
});

function countsOf(imported: number, skipped: number, errors: number) {
  return { imported, skipped, errors };
}

function emptyPerDomain() {
  const z = countsOf(0, 0, 0);
  return { items: z, quests: z, karma: z, factions: z, dialogs: z, npcs: z };
}
