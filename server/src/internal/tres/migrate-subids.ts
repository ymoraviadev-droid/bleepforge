// One-time migration: populate `_subId` on every sub-resource-backed JSON
// entry in dialoguer/data/. Reads the matching .tres, copies sub_resource
// ids by position into the JSON's nested arrays, preserves all other fields
// (so user edits aren't lost). Idempotent — entries that already have a
// `_subId` are left untouched.
//
// READ-ONLY against GODOT_PROJECT_ROOT.
//
// Usage:
//   pnpm --filter @bleepforge/server migrate-subids

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTres } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const DATA_ROOT = resolve(REPO_ROOT, "data");

interface Stats {
  filesScanned: number;
  filesUpdated: number;
  entriesPopulated: number;
}

async function main(): Promise<void> {
  const root = process.env.GODOT_PROJECT_ROOT;
  if (!root) {
    console.error("GODOT_PROJECT_ROOT not set.");
    process.exit(2);
  }
  const astroRoot = resolve(root);
  console.log(`[migrate] GODOT_PROJECT_ROOT: ${astroRoot}`);
  console.log(`[migrate] DATA_ROOT: ${DATA_ROOT}`);

  const totals: Stats = { filesScanned: 0, filesUpdated: 0, entriesPopulated: 0 };

  await migrateKarma(astroRoot, totals);
  await migrateQuests(astroRoot, totals);
  await migrateDialogs(astroRoot, totals);

  console.log("");
  console.log(
    `[migrate] scanned=${totals.filesScanned} updated=${totals.filesUpdated} entries=${totals.entriesPopulated}`,
  );
}

async function migrateKarma(astroRoot: string, totals: Stats): Promise<void> {
  const jsonDir = join(DATA_ROOT, "karma");
  const tresDir = join(astroRoot, "shared", "components", "karma", "impacts");
  await migrateGroup(jsonDir, async (json: any) => {
    const tres = await findTresWithId(tresDir, String(json.Id));
    if (!tres) return null;
    const subIds = extractRefArray(tres.text, "Deltas");
    return { rootSubIdsByKey: { Deltas: subIds }, jsonArrays: { Deltas: json.Deltas } };
  }, totals);
}

async function migrateQuests(astroRoot: string, totals: Stats): Promise<void> {
  const jsonDir = join(DATA_ROOT, "quests");
  const tresDir = join(astroRoot, "shared", "components", "quest", "quests");
  await migrateGroup(jsonDir, async (json: any) => {
    const tres = await findTresWithId(tresDir, String(json.Id));
    if (!tres) return null;
    return {
      rootSubIdsByKey: {
        Objectives: extractRefArray(tres.text, "Objectives"),
        Rewards: extractRefArray(tres.text, "Rewards"),
      },
      jsonArrays: { Objectives: json.Objectives, Rewards: json.Rewards },
    };
  }, totals);
}

async function migrateDialogs(astroRoot: string, totals: Stats): Promise<void> {
  const jsonRoot = join(DATA_ROOT, "dialogs");
  let folders;
  try {
    folders = await readdir(jsonRoot, { withFileTypes: true });
  } catch {
    return;
  }
  // Pre-walk all dialog .tres for fast lookup.
  const tresIndex = new Map<string, { abs: string; text: string }>();
  await indexDialogTres(astroRoot, tresIndex);

  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const folderName = folder.name;
    const folderPath = join(jsonRoot, folderName);
    const entries = await readdir(folderPath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) continue;
      if (e.name === "_layout.json") continue;
      const jsonPath = join(folderPath, e.name);
      totals.filesScanned++;
      const json = JSON.parse(await readFile(jsonPath, "utf8"));
      const id = String(json.Id);
      const key = `${folderName}/${id}`;
      const tres = tresIndex.get(key);
      if (!tres) continue;
      const lineSubIds = extractRefArray(tres.text, "Lines");
      let mutated = 0;
      for (let i = 0; i < (json.Lines ?? []).length; i++) {
        const line = json.Lines[i];
        if (!line._subId && lineSubIds[i]) {
          line._subId = lineSubIds[i];
          mutated++;
        }
        // Per-line choices
        if (line._subId) {
          const choiceSubIds = extractChoicesFor(tres.text, line._subId);
          for (let j = 0; j < (line.Choices ?? []).length; j++) {
            if (!line.Choices[j]._subId && choiceSubIds[j]) {
              line.Choices[j]._subId = choiceSubIds[j];
              mutated++;
            }
          }
        }
      }
      if (mutated > 0) {
        await writeFile(jsonPath, JSON.stringify(json, null, 2) + "\n", "utf8");
        totals.filesUpdated++;
        totals.entriesPopulated += mutated;
        console.log(`[migrate] ${jsonPath}: +${mutated} _subId`);
      }
    }
  }
}

// ---- Helpers ---------------------------------------------------------------

interface SubResolveResult {
  rootSubIdsByKey: Record<string, string[]>;
  jsonArrays: Record<string, any[]>;
}

async function migrateGroup(
  jsonDir: string,
  resolveFn: (json: any) => Promise<SubResolveResult | null>,
  totals: Stats,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(jsonDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".json")) continue;
    const jsonPath = join(jsonDir, e.name);
    totals.filesScanned++;
    const json = JSON.parse(await readFile(jsonPath, "utf8"));
    const r = await resolveFn(json);
    if (!r) continue;
    let mutated = 0;
    for (const arrayKey of Object.keys(r.jsonArrays)) {
      const arr = r.jsonArrays[arrayKey] ?? [];
      const subIds = r.rootSubIdsByKey[arrayKey] ?? [];
      for (let i = 0; i < arr.length; i++) {
        if (!arr[i]._subId && subIds[i]) {
          arr[i]._subId = subIds[i];
          mutated++;
        }
      }
    }
    if (mutated > 0) {
      await writeFile(jsonPath, JSON.stringify(json, null, 2) + "\n", "utf8");
      totals.filesUpdated++;
      totals.entriesPopulated += mutated;
      console.log(`[migrate] ${jsonPath}: +${mutated} _subId`);
    }
  }
}

async function findTresWithId(
  dir: string,
  id: string,
): Promise<{ abs: string; text: string } | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".tres")) continue;
    const abs = join(dir, e.name);
    const text = await readFile(abs, "utf8");
    if (text.includes(`Id = "${id}"`)) return { abs, text };
  }
  return null;
}

async function indexDialogTres(
  astroRoot: string,
  index: Map<string, { abs: string; text: string }>,
): Promise<void> {
  await walk(astroRoot, async (abs) => {
    if (!abs.endsWith(".tres")) return;
    const m = abs.match(/\/dialogs\/([^/]+)\/([^/]+)\.tres$/);
    if (!m) return;
    const folder = m[1]!;
    const id = m[2]!;
    const text = await readFile(abs, "utf8");
    if (!text.includes(`script_class="DialogSequence"`)) return;
    index.set(`${folder}/${id}`, { abs, text });
  });
}

async function walk(dir: string, fn: (path: string) => Promise<void>): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".godot" || e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, fn);
    else if (e.isFile()) await fn(full);
  }
}

// Reads the sub_resource ids referenced by `<key> = [SubResource("X"), ...]`
// in the .tres text. Naive but adequate for migration.
function extractRefArray(text: string, key: string): string[] {
  const re = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m");
  const m = text.match(re);
  if (!m) return [];
  const inner = m[1]!;
  const ids: string[] = [];
  const subRe = /SubResource\("([^"]+)"\)/g;
  let sm: RegExpExecArray | null;
  while ((sm = subRe.exec(inner)) !== null) {
    ids.push(sm[1]!);
  }
  return ids;
}

// For a given line sub_resource id, returns the choice sub_resource ids
// referenced by its Choices = [...] line.
function extractChoicesFor(text: string, lineSubId: string): string[] {
  const doc = parseTres(text);
  for (const s of doc.sections) {
    if (s.kind !== "sub_resource") continue;
    const idAttr = s.attrs.find((a) => a.key === "id");
    if (!idAttr) continue;
    const idVal = idAttr.rawValue.replace(/^"|"$/g, "");
    if (idVal !== lineSubId) continue;
    const entry = s.body.find((e) => e.kind === "property" && e.key === "Choices");
    if (!entry || entry.kind !== "property") return [];
    const ids: string[] = [];
    const re = /SubResource\("([^"]+)"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(entry.rawAfterEquals)) !== null) {
      ids.push(m[1]!);
    }
    return ids;
  }
  return [];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
