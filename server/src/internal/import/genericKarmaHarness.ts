// Round-trip parity gate for v0.2.8 Phase 2: the generic importer must
// produce JSON semantically equivalent to FoB's hand-rolled mapKarma
// for every real KarmaImpact .tres in the FoB corpus.
//
// Strategy:
//   1. Build projectIndex against GODOT_PROJECT_ROOT.
//   2. For each karma entry the index discovered:
//        a. Parse the .tres.
//        b. Run mapKarma (FoB-specific path).
//        c. Run readFromManifest with a synthetic Karma manifest entry
//           that matches the FoB schema (Id + Description + Deltas).
//        d. Compare the two outputs via canonical (key-sorted) JSON.
//   3. Pass/fail report; exit code 0 iff every file matched.
//
// Why a Karma-shaped synthetic manifest rather than the live one from
// godot-lib's emitter: v0.2.8 doesn't gate on the manifest being
// emitted, and the FoB Godot project may or may not have run the
// emitter recently. The synthetic entry pins the schema the harness
// validates against, decoupled from the manifest pipeline (which has
// its own tests in v0.2.6/v0.2.7).
//
// This is the v0.2.8 architectural proof: scalars / refs / arrays /
// sub-resources all flow through the generic path for one real domain.
// Phase 6's Karma migration drops mapKarma in favor of this path, and
// the harness becomes a regression gate for that switch.
//
// Run: `pnpm --filter @bleepforge/server run harness:import-karma`

import fs from "node:fs/promises";

import type { Entry, SubResource } from "@bleepforge/shared";

import { config } from "../../config.js";
import { projectIndex } from "../../lib/projectIndex/index.js";
import { mapKarma } from "./mappers.js";
import { readFromManifest } from "./generic/orchestrator.js";
import type { ReaderContext } from "./generic/types.js";
import { parseTres } from "./tresParser.js";

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

const KARMA_DELTA_SUB: SubResource = {
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

const SUB_RESOURCES = new Map<string, SubResource>([
  ["KarmaDelta", KARMA_DELTA_SUB],
]);

// Recursive key-sorted JSON for order-insensitive equality. Both readers
// produce equivalent data; only key insertion order differs (mapKarma
// builds `{ _subId, Faction, Amount }`, the generic path follows
// fieldOrder + appends `_subId`).
function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k])).join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

async function main(): Promise<void> {
  // CLI arg overrides config so the harness can target FoB regardless
  // of which project is active in the running Bleepforge install.
  // Usage: pnpm harness:import-karma [<godot-project-root>]
  const cliRoot = process.argv[2];
  const root = cliRoot ?? config.godotProjectRoot;
  if (!root) {
    console.error(
      "No Godot project root: pass as CLI arg or set GODOT_PROJECT_ROOT / active project",
    );
    process.exit(1);
  }

  console.log(`Building projectIndex against ${root} …`);
  const stats = await projectIndex.build(root);
  console.log(
    `  ${stats.tresCount} .tres + ${stats.pickupCount} pickup .tscn (${stats.durationMs}ms)`,
  );

  const karmaEntries = projectIndex.list("karma");
  console.log(`Karma entries discovered: ${karmaEntries.length}\n`);

  let matched = 0;
  let mismatched = 0;
  for (const entry of karmaEntries) {
    const text = await fs.readFile(entry.absPath, "utf8");
    const parsed = parseTres(text);

    const fobJson = mapKarma(parsed);
    if (!fobJson) {
      console.error(`SKIP  ${entry.absPath} — mapKarma returned null`);
      continue;
    }

    const ctx: ReaderContext = {
      godotRoot: root,
      filePath: entry.absPath,
      parsed,
      warnings: [],
      resolveRefByExtResource: () => null, // karma has no cross-domain refs
      resPathToAbs: (p) =>
        p.startsWith("res://") ? root + "/" + p.substring(6) : p,
      subResources: SUB_RESOURCES,
    };
    const { entity: genericJson, warnings } = readFromManifest(
      parsed,
      KARMA_ENTRY,
      ctx,
    );

    const fobCanon = canonicalStringify(fobJson);
    const genericCanon = canonicalStringify(genericJson);

    if (fobCanon === genericCanon) {
      matched++;
      console.log(`pass  ${entry.id}`);
      if (warnings.length > 0) {
        for (const w of warnings) console.log(`        warning: ${w}`);
      }
    } else {
      mismatched++;
      console.error(`FAIL  ${entry.id}`);
      console.error(`        FoB:     ${fobCanon}`);
      console.error(`        generic: ${genericCanon}`);
      if (warnings.length > 0) {
        for (const w of warnings) console.error(`        warning: ${w}`);
      }
    }
  }

  console.log(`\n${matched}/${karmaEntries.length} matched (${mismatched} mismatched)`);
  if (mismatched > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
