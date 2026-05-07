// Canary for DialogSequence (Phase A — scalar reconcile only).
// Pushes the JSON edit to a staged .tres. Read-only on GODOT_PROJECT_ROOT —
// output goes to dialoguer/.tres-staging/.
//
// Usage:
//   pnpm --filter @bleepforge/server canary-dialog <folder> <id> ['<json-overrides>']
//
// `folder` matches Bleepforge's data/dialogs/<folder>/<id>.json layout
// (Eddie, Krang, welcome, cut_door_001, …). The Godot side spreads dialog
// .tres files across multiple parent dirs, so we walk the project to find
// the matching <folder>/<id>.tres path.

import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTres } from "./parser.js";
import { emitTres } from "./emitter.js";
import { applyDialog, type DialogApplyContext, type DialogSequenceJson } from "./domains/dialog.js";
import { findScriptUidInProject, readTextureUid } from "./uidLookup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const STAGING_ROOT = resolve(REPO_ROOT, ".tres-staging");
const DIALOGS_JSON_DIR = resolve(REPO_ROOT, "data", "dialogs");

function assertUnderStaging(absPath: string): void {
  const rel = relative(STAGING_ROOT, absPath);
  if (rel.startsWith("..") || rel.startsWith(sep) || resolve(STAGING_ROOT, rel) !== absPath) {
    throw new Error(`Refusing to write outside staging: ${absPath}`);
  }
}

async function main(): Promise<void> {
  const folder = process.argv[2];
  const id = process.argv[3];
  const overridesArg = process.argv[4];
  if (!folder || !id) {
    console.error("Usage: pnpm canary-dialog <folder> <id> ['<json-overrides>']");
    console.error('Example: pnpm canary-dialog Eddie eddie_backstory \'{"SetsFlag":"new_flag"}\'');
    process.exit(2);
  }
  const root = process.env.GODOT_PROJECT_ROOT;
  if (!root) {
    console.error("GODOT_PROJECT_ROOT not set.");
    process.exit(2);
  }
  const astroRoot = resolve(root);

  // 1. Load JSON.
  const jsonPath = join(DIALOGS_JSON_DIR, folder, `${id}.json`);
  const json = JSON.parse(await readFile(jsonPath, "utf8")) as DialogSequenceJson;
  if (overridesArg) {
    const overrides = JSON.parse(overridesArg) as Partial<DialogSequenceJson>;
    Object.assign(json, overrides);
    console.log(`[canary-dialog] applied overrides: ${overridesArg}`);
  }
  console.log(`[canary-dialog] folder=${folder} id=${id}`);

  // 2. Find matching .tres by `<folder>/<id>.tres` path suffix.
  const wantSuffix = `${sep}dialogs${sep}${folder}${sep}${id}.tres`;
  const tresFiles = await listTresRecursive(astroRoot);
  const matches = tresFiles.filter((p) => p.endsWith(wantSuffix));
  if (matches.length === 0) {
    console.error(`[canary-dialog] no .tres found at */dialogs/${folder}/${id}.tres`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.warn(`[canary-dialog] multiple matches, using first:`);
    for (const m of matches) console.warn(`  ${m}`);
  }
  const matchAbs = matches[0]!;
  const relPath = relative(astroRoot, matchAbs);
  console.log(`[canary-dialog] matched .tres: ${relPath}`);

  const text = await readFile(matchAbs, "utf8");
  const doc = parseTres(text);

  // Pre-resolve texture UIDs for any Portrait paths referenced in JSON. Used
  // by the mapper to add a new ext_resource when the .tres doesn't yet
  // reference a portrait the JSON wants to point at.
  const portraitPaths = new Set<string>();
  for (const line of json.Lines) if (line.Portrait) portraitPaths.add(line.Portrait);
  const textureUidCache = new Map<string, string | null>();
  for (const p of portraitPaths) {
    textureUidCache.set(p, await readTextureUid(p));
  }
  // Pre-resolve DialogChoice.cs script UID — used as fallback when adding
  // the first choice to a sequence that has no DialogChoice.cs ext_resource.
  let dialogChoiceScriptUid: string | null = null;
  const needsChoiceScript = json.Lines.some((l) => l.Choices.length > 0);
  if (needsChoiceScript) {
    dialogChoiceScriptUid = await findScriptUidInProject(
      astroRoot,
      "res://shared/components/dialog/DialogChoice.cs",
    );
  }
  const ctx: DialogApplyContext = {
    godotRoot: astroRoot,
    resolveTextureUid: (abs) => textureUidCache.get(abs) ?? null,
    resolveDialogChoiceScriptUid: () => dialogChoiceScriptUid,
  };

  // 3. Apply.
  const result = applyDialog(doc, json, ctx);
  for (const a of result.resourceActions) {
    if (a.action !== "noop") console.log(`[canary-dialog] resource: ${a.action} ${a.key}`);
  }
  for (const r of result.linesRemoved) {
    console.log(
      `[canary-dialog] removed line[${r.index}] (${r.subId})${r.orphanChoiceIds.length ? ` + orphan choices: ${r.orphanChoiceIds.join(", ")}` : ""}`,
    );
  }
  for (const a of result.linesAdded) {
    console.log(
      `[canary-dialog] added line[${a.index}] (${a.subId})${a.choiceSubIds.length ? ` + choices: ${a.choiceSubIds.join(", ")}` : ""}`,
    );
  }
  for (const l of result.lines) {
    for (const a of l.actions) {
      if (a.action !== "noop") {
        console.log(`[canary-dialog] line[${l.index}] (${l.subId}): ${a.action} ${a.key}`);
      }
    }
    for (const r of l.choicesRemoved) {
      console.log(
        `[canary-dialog] line[${l.index}]: removed choice[${r.index}] (${r.subId})`,
      );
    }
    for (const a of l.choicesAdded) {
      console.log(
        `[canary-dialog] line[${l.index}]: added choice[${a.index}] (${a.subId})`,
      );
    }
    for (const c of l.choices) {
      for (const a of c.actions) {
        if (a.action !== "noop") {
          console.log(
            `[canary-dialog] line[${l.index}].choice[${c.index}] (${c.subId}): ${a.action} ${a.key}`,
          );
        }
      }
    }
  }
  for (const w of result.warnings) console.log(`[canary-dialog] warning: ${w}`);

  // 4. Emit + stage.
  const emitted = emitTres(doc);
  const stagedPath = join(STAGING_ROOT, relPath);
  assertUnderStaging(stagedPath);
  await mkdir(dirname(stagedPath), { recursive: true });
  await writeFile(stagedPath, emitted, "utf8");

  // 5. Diff.
  console.log("");
  console.log(`[canary-dialog] diff (original -> staged):`);
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
