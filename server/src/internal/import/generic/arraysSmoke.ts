// Smoke test for the generic importer's array handler.
//
// Two variants of array fields:
//   - itemRef arrays (NpcData.CasualRemarks shape) — items resolve
//     through ctx.resolveRefByExtResource per entry.
//   - of arrays (KarmaImpact.Deltas / Quest.Objectives shape) — items
//     recurse into orchestrator.readFlatFields against a SubResource
//     declaration's fields/fieldOrder. `_subId` populates from the
//     sub_resource section id so the writer can match entries on
//     reorder / edit / remove during round-trip.
//
// Pass/fail signal is the process exit code (0 = all pass).
// Run: `pnpm --filter @bleepforge/server run smoke:import-arrays`

import type { Entry, FieldDef, SubResource } from "@bleepforge/shared";
import { parseTres, type TresExtResource } from "../tresParser.js";
import { readFromManifest } from "./orchestrator.js";
import type { ReaderContext } from "./types.js";

interface Case {
  name: string;
  source: string;
  entry: Entry;
  expected: Record<string, unknown>;
  subResources?: Map<string, SubResource>;
  refResolutions?: Record<string, Record<string, string>>;
  expectedWarnings?: number;
}

const HEADER_BASE =
  '[gd_resource type="Resource" script_class="SmokeTest" load_steps=3 format=3]\n\n' +
  '[ext_resource type="Script" uid="uid://smoke" path="res://smoke.cs" id="1_smoke"]\n';

function buildDomainEntry(
  fields: Record<string, FieldDef>,
  fieldOrder: string[],
): Entry {
  return {
    domain: "smoke",
    kind: "domain",
    class: "SmokeTest",
    key: fieldOrder[0]!,
    folder: "smoke",
    fields,
    fieldOrder,
    view: "list",
    overrideUi: null,
  };
}

// KarmaDelta-shape sub-resource declaration for the of-array cases.
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

const CASES: Case[] = [
  // ---- itemRef arrays (NpcData.CasualRemarks shape) -----------------------
  {
    name: "itemRef array: resolves each entry through resolver",
    source:
      HEADER_BASE +
      '[ext_resource type="Resource" uid="uid://b1" path="res://balloons/hap_500/balloons/hi.tres" id="2_b1"]\n' +
      '[ext_resource type="Resource" uid="uid://b2" path="res://balloons/hap_500/balloons/yo.tres" id="2_b2"]\n\n' +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'CasualRemarks = [ExtResource("2_b1"), ExtResource("2_b2")]\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        CasualRemarks: {
          type: "array",
          itemRef: { to: "balloon" },
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["CasualRemarks"],
    ),
    refResolutions: {
      balloon: {
        "res://balloons/hap_500/balloons/hi.tres": "hap_500/hi",
        "res://balloons/hap_500/balloons/yo.tres": "hap_500/yo",
      },
    },
    expected: { CasualRemarks: ["hap_500/hi", "hap_500/yo"] },
  },
  {
    name: "itemRef array: empty",
    source:
      HEADER_BASE +
      "\n[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      "CasualRemarks = []\n" +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        CasualRemarks: {
          type: "array",
          itemRef: { to: "balloon" },
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["CasualRemarks"],
    ),
    expected: { CasualRemarks: [] },
  },
  {
    name: "itemRef array: absent → empty array",
    source:
      HEADER_BASE +
      "\n[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        CasualRemarks: {
          type: "array",
          itemRef: { to: "balloon" },
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["CasualRemarks"],
    ),
    expected: { CasualRemarks: [] },
  },
  {
    name: "itemRef array: dangling entry → verbatim res:// + warning",
    source:
      HEADER_BASE +
      '[ext_resource type="Resource" uid="uid://b_x" path="res://balloons/missing.tres" id="2_x"]\n\n' +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'CasualRemarks = [ExtResource("2_x")]\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        CasualRemarks: {
          type: "array",
          itemRef: { to: "balloon" },
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["CasualRemarks"],
    ),
    refResolutions: {},
    expected: { CasualRemarks: ["res://balloons/missing.tres"] },
    expectedWarnings: 1,
  },

  // ---- of arrays (KarmaImpact.Deltas shape) -------------------------------
  {
    name: "of array: sub_resource entries recurse through readFlatFields",
    source:
      HEADER_BASE +
      "\n" +
      '[sub_resource type="Resource" id="d1"]\n' +
      'script = ExtResource("1_smoke")\n' +
      "Faction = 1\n" +
      "Amount = -5\n\n" +
      '[sub_resource type="Resource" id="d2"]\n' +
      'script = ExtResource("1_smoke")\n' +
      "Faction = 2\n" +
      "Amount = 10\n\n" +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'Deltas = [SubResource("d1"), SubResource("d2")]\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        Deltas: {
          type: "array",
          of: "KarmaDelta",
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["Deltas"],
    ),
    subResources: new Map([["KarmaDelta", KARMA_DELTA_SUB]]),
    expected: {
      Deltas: [
        { Faction: "FreeRobots", Amount: -5, _subId: "d1" },
        { Faction: "RFF", Amount: 10, _subId: "d2" },
      ],
    },
  },
  {
    name: "of array: enum index 0 omitted in sub → values[0]",
    source:
      HEADER_BASE +
      "\n" +
      '[sub_resource type="Resource" id="d1"]\n' +
      'script = ExtResource("1_smoke")\n' +
      "Amount = 7\n\n" +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'Deltas = [SubResource("d1")]\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        Deltas: {
          type: "array",
          of: "KarmaDelta",
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["Deltas"],
    ),
    subResources: new Map([["KarmaDelta", KARMA_DELTA_SUB]]),
    expected: {
      Deltas: [{ Faction: "Scavengers", Amount: 7, _subId: "d1" }],
    },
  },
  {
    name: "of array: missing sub-resource declaration → empty + warning",
    source:
      HEADER_BASE +
      "\n" +
      '[sub_resource type="Resource" id="d1"]\n' +
      'script = ExtResource("1_smoke")\n' +
      "Faction = 1\nAmount = 5\n\n" +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'Deltas = [SubResource("d1")]\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        Deltas: {
          type: "array",
          of: "MissingDelta",
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["Deltas"],
    ),
    subResources: new Map(), // intentionally empty
    expected: { Deltas: [] },
    expectedWarnings: 1,
  },
];

function runCase(c: Case): string | null {
  const parsed = parseTres(c.source);
  const resolutions = c.refResolutions ?? {};
  const ctx: ReaderContext = {
    godotRoot: "/godot",
    filePath: "/godot/smoke.tres",
    parsed,
    warnings: [],
    resolveRefByExtResource: (ext: TresExtResource, domain: string) => {
      return resolutions[domain]?.[ext.path] ?? null;
    },
    resPathToAbs: (p) => (p.startsWith("res://") ? "/godot/" + p.substring(6) : p),
    subResources: c.subResources ?? new Map(),
  };
  const { entity, warnings } = readFromManifest(parsed, c.entry, ctx);
  if (!entity) return "readFromManifest returned null entity";

  const actualJson = JSON.stringify(entity, null, 2);
  const expectedJson = JSON.stringify(c.expected, null, 2);
  if (actualJson !== expectedJson) {
    return `JSON mismatch.\n  expected: ${expectedJson}\n  actual:   ${actualJson}`;
  }
  if (c.expectedWarnings !== undefined && warnings.length !== c.expectedWarnings) {
    return `expected ${c.expectedWarnings} warning(s), got ${warnings.length}: ${warnings.join("; ")}`;
  }
  return null;
}

async function main(): Promise<void> {
  let failed = 0;
  for (const c of CASES) {
    const err = runCase(c);
    if (err) {
      failed++;
      console.error(`FAIL  ${c.name}\n        ${err}`);
    } else {
      console.log(`pass  ${c.name}`);
    }
  }
  console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
