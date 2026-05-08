// Canary: take one Bleepforge JSON edit (an Item's DisplayName) and produce
// a modified .tres in .tres-staging/. Never writes to GODOT_PROJECT_ROOT.
//
// Usage:
//   pnpm --filter @bleepforge/server canary <slug>
//
// Pass criteria: the diff between original and staged should be exactly one
// line — the DisplayName property — with everything else byte-identical.

import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTres } from "./parser.js";
import { emitTres } from "./emitter.js";
import { applyItemScalars, type ItemJson } from "./domains/item.js";
import type { Doc, Section } from "./types.js";
import { readTextureUid } from "./uidLookup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const STAGING_ROOT = resolve(REPO_ROOT, ".tres-staging");
const ITEMS_JSON_DIR = resolve(REPO_ROOT, "data", "items");

function assertUnderStaging(absPath: string): void {
  const rel = relative(STAGING_ROOT, absPath);
  if (rel.startsWith("..") || rel.startsWith(sep) || resolve(STAGING_ROOT, rel) !== absPath) {
    throw new Error(`Refusing to write outside staging: ${absPath}`);
  }
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  const overridesArg = process.argv[3];
  if (!slug) {
    console.error("Usage: pnpm --filter @bleepforge/server canary <slug> ['<json-overrides>']");
    console.error('Example: pnpm canary rff_keycard \'{"Category":"Weapon","Price":750}\'');
    process.exit(2);
  }
  const root = process.env.GODOT_PROJECT_ROOT;
  if (!root) {
    console.error("GODOT_PROJECT_ROOT not set.");
    process.exit(2);
  }
  const astroRoot = resolve(root);

  // 1. Read the Bleepforge-side JSON for this slug.
  const jsonPath = join(ITEMS_JSON_DIR, `${slug}.json`);
  const json = JSON.parse(await readFile(jsonPath, "utf8")) as ItemJson;
  if (overridesArg) {
    const overrides = JSON.parse(overridesArg) as Partial<ItemJson>;
    Object.assign(json, overrides);
    console.log(`[canary] applied overrides: ${overridesArg}`);
  }
  console.log(`[canary] slug=${slug}`);

  // 2. Find the matching .tres by walking astro-man and matching the
  //    [resource] block's Slug property.
  const tresFiles: string[] = [];
  await walk(astroRoot, tresFiles);

  let matchAbs: string | undefined;
  let matchSection: Section | undefined;
  let matchDoc: ReturnType<typeof parseTres> | undefined;
  let matchOriginal: string | undefined;

  for (const abs of tresFiles) {
    const text = await readFile(abs, "utf8");
    const doc = parseTres(text);
    // Only authored-resource files have a top-level [resource] block.
    const resourceSection = doc.sections.find((s) => s.kind === "resource");
    if (!resourceSection) continue;
    const slugEntry = resourceSection.body.find(
      (e) => e.kind === "property" && e.key === "Slug",
    );
    if (!slugEntry || slugEntry.kind !== "property") continue;
    const raw = slugEntry.rawAfterEquals.trim();
    // Compare the quoted form to skip parsing.
    if (raw === `"${slug}"`) {
      matchAbs = abs;
      matchSection = resourceSection;
      matchDoc = doc;
      matchOriginal = text;
      break;
    }
  }

  if (!matchAbs || !matchSection || !matchDoc || !matchOriginal) {
    console.error(`[canary] no .tres found with Slug = "${slug}" under ${astroRoot}`);
    process.exit(1);
  }
  const relPath = relative(astroRoot, matchAbs);
  console.log(`[canary] matched .tres: ${relPath}`);

  // 3. Mutate the AST — reconcile every known scalar field. For each one:
  //    update if value differs, insert if missing-and-non-default, remove
  //    if present-but-now-default, no-op otherwise.
  const iconUid = json.Icon ? await readTextureUid(json.Icon) : null;
  const textureCtx = {
    godotRoot: astroRoot,
    resolveTextureUid: (abs: string) => (abs === json.Icon ? iconUid : null),
  };
  const result = applyItemScalars(matchDoc as Doc, matchSection, json, textureCtx);
  for (const a of result.actions) {
    if (a.action !== "noop") console.log(`[canary] ${a.action}: ${a.key}`);
  }
  for (const w of result.warnings) console.log(`[canary] warning: ${w}`);

  // 4. Emit to staging.
  const emitted = emitTres(matchDoc);
  const stagedPath = join(STAGING_ROOT, relPath);
  assertUnderStaging(stagedPath);
  await mkdir(dirname(stagedPath), { recursive: true });
  await writeFile(stagedPath, emitted, "utf8");
  console.log(`[canary] staged: ${stagedPath}`);

  // 5. Diff. Use system `diff -u` for friendly output.
  console.log("");
  console.log(`[canary] diff (original -> staged):`);
  const diffProc = spawnSync("diff", ["-u", matchAbs, stagedPath], { encoding: "utf8" });
  if (diffProc.stdout) process.stdout.write(diffProc.stdout);
  if (diffProc.stderr) process.stderr.write(diffProc.stderr);

  // Exit 0 if diff found exactly the expected change pattern; for now just
  // exit success and let Yonatan eyeball the diff.
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".godot") continue;
    if (entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".tres")) out.push(full);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
