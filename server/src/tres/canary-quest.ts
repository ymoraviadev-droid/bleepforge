// Canary for Quest. Pushes the JSON edit (resource + objectives + rewards)
// to a staged .tres. Read-only on GODOT_PROJECT_ROOT — output goes to
// dialoguer/.tres-staging/.
//
// Usage:
//   pnpm --filter @bleepforge/server canary-quest <id> ['<json-overrides>']

import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTres } from "./parser.js";
import { emitTres } from "./emitter.js";
import { applyQuest, type QuestApplyContext, type QuestJson } from "./domains/quest.js";
import { findScriptUidInProject, readItemUid } from "./uidLookup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const STAGING_ROOT = resolve(REPO_ROOT, ".tres-staging");
const QUEST_JSON_DIR = resolve(REPO_ROOT, "data", "quests");

function assertUnderStaging(absPath: string): void {
  const rel = relative(STAGING_ROOT, absPath);
  if (rel.startsWith("..") || rel.startsWith(sep) || resolve(STAGING_ROOT, rel) !== absPath) {
    throw new Error(`Refusing to write outside staging: ${absPath}`);
  }
}

async function main(): Promise<void> {
  const id = process.argv[2];
  const overridesArg = process.argv[3];
  if (!id) {
    console.error("Usage: pnpm canary-quest <id> ['<json-overrides>']");
    process.exit(2);
  }
  const root = process.env.GODOT_PROJECT_ROOT;
  if (!root) {
    console.error("GODOT_PROJECT_ROOT not set.");
    process.exit(2);
  }
  const astroRoot = resolve(root);
  const questDir = join(astroRoot, "shared", "components", "quest", "quests");

  const jsonPath = join(QUEST_JSON_DIR, `${id}.json`);
  const json = JSON.parse(await readFile(jsonPath, "utf8")) as QuestJson;
  if (overridesArg) {
    const overrides = JSON.parse(overridesArg) as Partial<QuestJson>;
    Object.assign(json, overrides);
    console.log(`[canary-quest] applied overrides: ${overridesArg}`);
  }
  console.log(`[canary-quest] id=${id}`);

  const tresFiles = await listTresRecursive(questDir);
  let matchAbs: string | undefined;
  let matchDoc: ReturnType<typeof parseTres> | undefined;
  for (const abs of tresFiles) {
    const text = await readFile(abs, "utf8");
    const doc = parseTres(text);
    const resource = doc.sections.find((s) => s.kind === "resource");
    if (!resource) continue;
    const idEntry = resource.body.find((e) => e.kind === "property" && e.key === "Id");
    if (!idEntry || idEntry.kind !== "property") continue;
    if (idEntry.rawAfterEquals.trim() === `"${id}"`) {
      matchAbs = abs;
      matchDoc = doc;
      break;
    }
  }
  if (!matchAbs || !matchDoc) {
    console.error(`[canary-quest] no quest .tres found with Id = "${id}" under ${questDir}`);
    process.exit(1);
  }
  const relPath = relative(astroRoot, matchAbs);
  console.log(`[canary-quest] matched .tres: ${relPath}`);

  // Pre-resolve item UIDs for any slug referenced in JSON. Used by the mapper
  // to add a new ext_resource block when the .tres doesn't yet reference an
  // item that the JSON wants to point at.
  const itemSlugs = new Set<string>();
  for (const obj of json.Objectives) if (obj.TargetItem) itemSlugs.add(obj.TargetItem);
  for (const rwd of json.Rewards) if (rwd.Item) itemSlugs.add(rwd.Item);
  const itemUidCache = new Map<string, string | null>();
  for (const slug of itemSlugs) {
    itemUidCache.set(slug, await readItemUid(astroRoot, slug));
  }
  // Pre-resolve script UIDs as fallback for adding the first
  // objective/reward to a quest that lacks the corresponding script ref.
  let objectiveScriptUid: string | null = null;
  let rewardScriptUid: string | null = null;
  if (json.Objectives.length > 0) {
    objectiveScriptUid = await findScriptUidInProject(
      astroRoot,
      "res://shared/components/quest/QuestObjective.cs",
    );
  }
  if (json.Rewards.length > 0) {
    rewardScriptUid = await findScriptUidInProject(
      astroRoot,
      "res://shared/components/quest/QuestReward.cs",
    );
  }
  const ctx: QuestApplyContext = {
    resolveItemUid: (slug) => itemUidCache.get(slug) ?? null,
    resolveObjectiveScriptUid: () => objectiveScriptUid,
    resolveRewardScriptUid: () => rewardScriptUid,
  };

  const result = applyQuest(matchDoc, json, ctx);
  for (const a of result.resourceActions) {
    if (a.action !== "noop") console.log(`[canary-quest] resource: ${a.action} ${a.key}`);
  }
  for (const r of result.objectivesRemoved) {
    console.log(`[canary-quest] removed objective (${r.subId})`);
  }
  for (const a of result.objectivesAdded) {
    console.log(`[canary-quest] added objective[${a.index}] (${a.subId})`);
  }
  for (const o of result.objectivesUpdated) {
    for (const a of o.actions) {
      if (a.action !== "noop") {
        console.log(`[canary-quest] objective[${o.index}] (${o.subId}): ${a.action} ${a.key}`);
      }
    }
  }
  for (const r of result.rewardsRemoved) {
    console.log(`[canary-quest] removed reward (${r.subId})`);
  }
  for (const a of result.rewardsAdded) {
    console.log(`[canary-quest] added reward[${a.index}] (${a.subId})`);
  }
  for (const r of result.rewardsUpdated) {
    for (const a of r.actions) {
      if (a.action !== "noop") {
        console.log(`[canary-quest] reward[${r.index}] (${r.subId}): ${a.action} ${a.key}`);
      }
    }
  }
  for (const w of result.warnings) console.log(`[canary-quest] warning: ${w}`);

  const emitted = emitTres(matchDoc);
  const stagedPath = join(STAGING_ROOT, relPath);
  assertUnderStaging(stagedPath);
  await mkdir(dirname(stagedPath), { recursive: true });
  await writeFile(stagedPath, emitted, "utf8");

  console.log("");
  console.log(`[canary-quest] diff (original -> staged):`);
  const diffProc = spawnSync("diff", ["-u", matchAbs, stagedPath], { encoding: "utf8" });
  if (diffProc.stdout) process.stdout.write(diffProc.stdout);
  if (diffProc.stderr) process.stderr.write(diffProc.stderr);
}

async function listTresRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === ".godot" || e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listTresRecursive(full)));
    else if (e.isFile() && e.name.endsWith(".tres")) out.push(full);
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
