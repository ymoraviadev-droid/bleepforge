// Validation harness for the v0.2.7 generic mapper.
//
// Walks every Karma .tres in the FoB Godot project, drives the generic
// mapper (writeFromManifest + orphan ext_resource cleanup) against a
// hand-authored Karma manifest entry and the corresponding JSON cache,
// then compares the emitted output to the original .tres byte-for-byte.
//
// "Hand-authored manifest entry" is the load-bearing concession: FoB
// isn't ported to BleepforgeRegistry per the v0.2.6 locked decisions,
// so its bleepforge_manifest.json doesn't carry a Karma entry. The
// shape declared here mirrors what godot-lib's emitter would write if
// FoB were ported — same field names, types, fieldOrder, sub-resource
// declaration. A pass means the generic mapper produces byte-identical
// output against the real corpus.
//
// What this validates:
//   - Scalar handlers (string for Id + Description, enum int + int for
//     KarmaDelta.Faction + Amount).
//   - Sub-resource array handler (Deltas), _subId matching against
//     existing sub_resource sections, default-aware emit (Faction =
//     "Scavengers" omitted; Amount = 0 omitted), untyped container.
//   - Script ext_resource find-or-mint via scriptIndex.
//   - Orphan ext_resource cleanup post-pass.
//
// What this does NOT validate (out of scope for v0.2.7):
//   - Production dispatch (the Karma override stays; this harness runs
//     writeFromManifest directly).
//   - discriminatedFamily entries.
//   - texture / scene handlers (Karma uses neither).
//
// Run: `pnpm --filter @bleepforge/server run harness:generic-karma`

import { readFile } from "node:fs/promises";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Entry, SubResource } from "@bleepforge/shared";
import { emitTres } from "./emitter.js";
import { writeFromManifest } from "./generic/orchestrator.js";
import { parseTres } from "./parser.js";
import { removeOrphanExtResources } from "./mutate.js";
import type { RefResolution, WriterContext } from "./generic/types.js";

const GODOT_ROOT =
  process.env.GODOT_PROJECT_ROOT ??
  "/home/ymoravia/Data/Projects/Godot/astro-man";
const KARMA_DIR = path.join(GODOT_ROOT, "shared/components/karma/impacts");
const JSON_CACHE_DIR = path.join(
  process.cwd().endsWith("server") ? path.join(process.cwd(), "..") : process.cwd(),
  "projects/flock-of-bleeps/data/karma",
);

const KARMA_DELTA_SCRIPT_RES_PATH =
  "res://shared/components/karma/KarmaDelta.cs";
const KARMA_DELTA_SCRIPT_UID_SIDECAR = path.join(
  GODOT_ROOT,
  "shared/components/karma/KarmaDelta.cs.uid",
);

// ---- Synthetic manifest entry --------------------------------------------
// Mirrors what godot-lib's ManifestEmitter would write if FoB's
// KarmaImpact / KarmaDelta were declared as BleepforgeResources.

const KARMA_DELTA_SUBRESOURCE: SubResource = {
  subResource: "KarmaDelta",
  class: "KarmaDelta",
  stableIdField: "_subId",
  fields: {
    Faction: {
      type: "enum",
      values: ["Scavengers", "FreeRobots", "RFF", "Grove"],
      required: false,
    },
    Amount: { type: "int", required: false },
  },
  fieldOrder: ["Faction", "Amount"],
};

const KARMA_ENTRY: Entry = {
  domain: "karma",
  kind: "domain",
  class: "KarmaImpact",
  key: "Id",
  folder: "shared/components/karma/impacts",
  fields: {
    Id: { type: "string", required: true },
    Description: { type: "multiline", required: false },
    Deltas: {
      type: "array",
      of: "KarmaDelta",
      arrayContainerType: "untyped",
      nullable: false,
      required: false,
    },
  },
  fieldOrder: ["Id", "Description", "Deltas"],
  view: "list",
  overrideUi: null,
};

// ---- Harness --------------------------------------------------------------

interface CaseResult {
  file: string;
  status: "clean" | "differs" | "error";
  message?: string;
  diffPreview?: string;
}

async function main() {
  console.log(`[harness:generic-karma] GODOT_PROJECT_ROOT: ${GODOT_ROOT}`);
  console.log(`[harness:generic-karma] karma dir: ${KARMA_DIR}`);
  console.log(`[harness:generic-karma] json cache: ${JSON_CACHE_DIR}`);

  const scriptUid = await readScriptUidSidecar();
  if (!scriptUid) {
    console.error(
      `[harness:generic-karma] cannot read ${KARMA_DELTA_SCRIPT_UID_SIDECAR} — aborting`,
    );
    process.exit(2);
  }
  console.log(`[harness:generic-karma] KarmaDelta.cs UID: ${scriptUid}`);

  let tresFiles: string[];
  try {
    tresFiles = (await fs.readdir(KARMA_DIR))
      .filter((n) => n.endsWith(".tres"))
      .map((n) => path.join(KARMA_DIR, n));
  } catch (err) {
    console.error(`[harness:generic-karma] readdir failed: ${(err as Error).message}`);
    process.exit(2);
  }
  console.log(`[harness:generic-karma] found ${tresFiles.length} .tres files`);

  const results: CaseResult[] = [];
  for (const tresPath of tresFiles) {
    results.push(await runOne(tresPath, scriptUid));
  }

  let clean = 0;
  let differs = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "clean") clean++;
    else if (r.status === "differs") differs++;
    else errors++;
  }
  console.log(`\n[harness:generic-karma] clean:   ${clean}`);
  console.log(`[harness:generic-karma] differs: ${differs}`);
  console.log(`[harness:generic-karma] errors:  ${errors}`);

  if (differs > 0 || errors > 0) {
    console.log("\n--- details ---");
    for (const r of results) {
      if (r.status === "clean") continue;
      console.log(`\n${r.status.toUpperCase()}: ${r.file}`);
      if (r.message) console.log(`  ${r.message}`);
      if (r.diffPreview) console.log(r.diffPreview);
    }
  }

  process.exit(differs === 0 && errors === 0 ? 0 : 1);
}

async function runOne(tresPath: string, scriptUid: string): Promise<CaseResult> {
  const file = path.basename(tresPath);
  let original: string;
  try {
    original = await readFile(tresPath, "utf8");
  } catch (err) {
    return { file, status: "error", message: `read .tres failed: ${(err as Error).message}` };
  }

  const slug = file.replace(/\.tres$/, "");
  const jsonPath = path.join(JSON_CACHE_DIR, `${slug}.json`);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await readFile(jsonPath, "utf8"));
  } catch (err) {
    return { file, status: "error", message: `read JSON cache failed: ${(err as Error).message}` };
  }

  let emitted: string;
  try {
    const doc = parseTres(original);
    const ctx: WriterContext = {
      godotRoot: GODOT_ROOT,
      doc,
      warnings: [],
      resolveRef: (() => null) as () => RefResolution | null,
      resolveTextureUid: () => null,
      resolveSceneUid: () => null,
      resolveScriptByClassName: (name) =>
        name === "KarmaDelta"
          ? { resPath: KARMA_DELTA_SCRIPT_RES_PATH, uid: scriptUid }
          : null,
      subResources: new Map([[KARMA_DELTA_SUBRESOURCE.subResource, KARMA_DELTA_SUBRESOURCE]]),
    };
    writeFromManifest(doc, KARMA_ENTRY, json, ctx);
    removeOrphanExtResources(doc);
    emitted = emitTres(doc);
  } catch (err) {
    return { file, status: "error", message: `mapper threw: ${(err as Error).message}` };
  }

  if (emitted === original) {
    return { file, status: "clean" };
  }
  return {
    file,
    status: "differs",
    diffPreview: simpleDiff(original, emitted),
  };
}

async function readScriptUidSidecar(): Promise<string | null> {
  try {
    const text = await readFile(KARMA_DELTA_SCRIPT_UID_SIDECAR, "utf8");
    const trimmed = text.trim();
    return trimmed.startsWith("uid://") ? trimmed : null;
  } catch {
    return null;
  }
}

function simpleDiff(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const x = aLines[i] ?? "";
    const y = bLines[i] ?? "";
    if (x === y) continue;
    out.push(`  line ${i + 1}:`);
    out.push(`    - ${JSON.stringify(x)}`);
    out.push(`    + ${JSON.stringify(y)}`);
    if (out.length > 30) {
      out.push("    (truncated)");
      break;
    }
  }
  return out.join("\n");
}

main();
