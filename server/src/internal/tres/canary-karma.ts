// Canary for KarmaImpact: pushes the JSON edit (main resource scalars +
// per-delta sub_resource scalars) to a staged .tres. Read-only on
// GODOT_PROJECT_ROOT — output goes to dialoguer/.tres-staging/.
//
// Usage:
//   pnpm --filter @bleepforge/server canary-karma <id> ['<json-overrides>']

import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTres } from "./parser.js";
import { emitTres } from "./emitter.js";
import { applyKarma, type KarmaJson } from "./domains/karma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const STAGING_ROOT = resolve(REPO_ROOT, ".tres-staging");
const KARMA_JSON_DIR = resolve(REPO_ROOT, "data", "karma");

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
    console.error("Usage: pnpm canary-karma <id> ['<json-overrides>']");
    console.error('Example: pnpm canary-karma krang_killed_for_eddie \'{"Description":"new desc"}\'');
    process.exit(2);
  }
  const root = process.env.GODOT_PROJECT_ROOT;
  if (!root) {
    console.error("GODOT_PROJECT_ROOT not set.");
    process.exit(2);
  }
  const astroRoot = resolve(root);
  const karmaDir = join(astroRoot, "shared", "components", "karma", "impacts");

  // 1. Load JSON.
  const jsonPath = join(KARMA_JSON_DIR, `${id}.json`);
  const json = JSON.parse(await readFile(jsonPath, "utf8")) as KarmaJson;
  if (overridesArg) {
    const overrides = JSON.parse(overridesArg) as Partial<KarmaJson>;
    Object.assign(json, overrides);
    console.log(`[canary-karma] applied overrides: ${overridesArg}`);
  }
  console.log(`[canary-karma] id=${id}`);

  // 2. Find matching .tres by Id.
  const tresFiles = await listTresRecursive(karmaDir);
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
    console.error(`[canary-karma] no .tres found with Id = "${id}" under ${karmaDir}`);
    process.exit(1);
  }
  const relPath = relative(astroRoot, matchAbs);
  console.log(`[canary-karma] matched .tres: ${relPath}`);

  // 3. Apply.
  const result = applyKarma(matchDoc, json);
  for (const a of result.resourceActions) {
    if (a.action !== "noop") console.log(`[canary-karma] resource: ${a.action} ${a.key}`);
  }
  for (const r of result.deltasRemoved) {
    console.log(`[canary-karma] removed delta (${r.subId})`);
  }
  for (const a of result.deltasAdded) {
    console.log(`[canary-karma] added delta[${a.index}] (${a.subId})`);
  }
  for (const d of result.deltasUpdated) {
    for (const a of d.actions) {
      if (a.action !== "noop") {
        console.log(`[canary-karma] delta[${d.index}] (${d.subId}): ${a.action} ${a.key}`);
      }
    }
  }
  for (const w of result.warnings) console.log(`[canary-karma] warning: ${w}`);

  // 4. Emit + stage.
  const emitted = emitTres(matchDoc);
  const stagedPath = join(STAGING_ROOT, relPath);
  assertUnderStaging(stagedPath);
  await mkdir(dirname(stagedPath), { recursive: true });
  await writeFile(stagedPath, emitted, "utf8");

  // 5. Diff.
  console.log("");
  console.log(`[canary-karma] diff (original -> staged):`);
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
