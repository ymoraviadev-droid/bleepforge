// Smoke test for the generic importer's single subresource handler.
//
// Unlike array entries, single subresources are positionally identified
// — they ARE the host field — so no `_subId` lives on the JSON value.
// The canonical FoB instance is NpcData.LootTable, which wraps an
// Entries array of LootEntry sub-resources: the subresource handler
// recurses into the array handler, which recurses back into the
// subresource handler per entry. Both paths exercised here.
//
// Pass/fail signal is the process exit code (0 = all pass).
// Run: `pnpm --filter @bleepforge/server run smoke:import-subresource`

import type { Entry, FieldDef, SubResource } from "@bleepforge/shared";
import { parseTres } from "../tresParser.js";
import { readFromManifest } from "./orchestrator.js";
import type { ReaderContext } from "./types.js";

interface Case {
  name: string;
  source: string;
  entry: Entry;
  expected: Record<string, unknown>;
  subResources?: Map<string, SubResource>;
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

// NpcData.LootTable shape: wraps an Entries array of LootEntry.
const LOOT_TABLE_SUB: SubResource = {
  subResource: "LootTable",
  class: "LootTable",
  stableIdField: "_subId",
  fields: {
    Entries: {
      type: "array",
      of: "LootEntry",
      arrayContainerType: "typed",
      nullable: false,
      required: false,
    },
  },
  fieldOrder: ["Entries"],
};

const LOOT_ENTRY_SUB: SubResource = {
  subResource: "LootEntry",
  class: "LootEntry",
  stableIdField: "_subId",
  fields: {
    Chance: { type: "float", required: false, default: 1 },
    MinAmount: { type: "int", required: false, default: 1 },
    MaxAmount: { type: "int", required: false, default: 1 },
  },
  fieldOrder: ["Chance", "MinAmount", "MaxAmount"],
};

const CASES: Case[] = [
  {
    name: "subresource: present → recursed, NO _subId at top",
    source:
      HEADER_BASE +
      "\n" +
      '[sub_resource type="Resource" id="lt1"]\n' +
      'script = ExtResource("1_smoke")\n' +
      "Entries = []\n\n" +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'LootTable = SubResource("lt1")\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        LootTable: {
          type: "subresource",
          of: "LootTable",
          nullable: true,
          required: false,
        },
      },
      ["LootTable"],
    ),
    subResources: new Map([
      ["LootTable", LOOT_TABLE_SUB],
      ["LootEntry", LOOT_ENTRY_SUB],
    ]),
    expected: { LootTable: { Entries: [] } },
  },
  {
    name: "subresource: absent → null",
    source:
      HEADER_BASE +
      "\n[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        LootTable: {
          type: "subresource",
          of: "LootTable",
          nullable: true,
          required: false,
        },
      },
      ["LootTable"],
    ),
    subResources: new Map([
      ["LootTable", LOOT_TABLE_SUB],
      ["LootEntry", LOOT_ENTRY_SUB],
    ]),
    expected: { LootTable: null },
  },
  {
    name: "subresource: declaration missing → null + warning",
    source:
      HEADER_BASE +
      "\n" +
      '[sub_resource type="Resource" id="lt1"]\n' +
      'script = ExtResource("1_smoke")\n\n' +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'LootTable = SubResource("lt1")\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        LootTable: {
          type: "subresource",
          of: "LootTable",
          nullable: true,
          required: false,
        },
      },
      ["LootTable"],
    ),
    subResources: new Map(),
    expected: { LootTable: null },
    expectedWarnings: 1,
  },
  {
    name: "subresource: nested array of LootEntry recurses correctly",
    source:
      HEADER_BASE +
      "\n" +
      '[sub_resource type="Resource" id="le1"]\n' +
      'script = ExtResource("1_smoke")\n' +
      "Chance = 0.5\nMinAmount = 1\nMaxAmount = 3\n\n" +
      '[sub_resource type="Resource" id="le2"]\n' +
      'script = ExtResource("1_smoke")\n' +
      "Chance = 0.25\nMinAmount = 2\nMaxAmount = 4\n\n" +
      '[sub_resource type="Resource" id="lt1"]\n' +
      'script = ExtResource("1_smoke")\n' +
      'Entries = [SubResource("le1"), SubResource("le2")]\n\n' +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'LootTable = SubResource("lt1")\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      {
        LootTable: {
          type: "subresource",
          of: "LootTable",
          nullable: true,
          required: false,
        },
      },
      ["LootTable"],
    ),
    subResources: new Map([
      ["LootTable", LOOT_TABLE_SUB],
      ["LootEntry", LOOT_ENTRY_SUB],
    ]),
    expected: {
      LootTable: {
        Entries: [
          { Chance: 0.5, MinAmount: 1, MaxAmount: 3, _subId: "le1" },
          { Chance: 0.25, MinAmount: 2, MaxAmount: 4, _subId: "le2" },
        ],
      },
    },
  },
];

function runCase(c: Case): string | null {
  const parsed = parseTres(c.source);
  const ctx: ReaderContext = {
    godotRoot: "/godot",
    filePath: "/godot/smoke.tres",
    parsed,
    warnings: [],
    resolveRefByExtResource: () => null,
    resPathToAbs: (p) => p,
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
