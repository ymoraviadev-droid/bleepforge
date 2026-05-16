// Smoke test for the subresource handler — single inline sub_resource
// fields (NpcData.LootTable shape, with a nested Entries array of
// LootEntry sub_resources).
//
// Exercises:
//   - Empty JSON → teardown including nested sub_resources.
//   - Non-empty JSON → mint LootTable + nested Entries via array
//     recursion.
//   - Existing LootTable + non-empty JSON → reconcile in place.
//   - Missing script UID → warning + no mutation.
//
// Run: `pnpm --filter @bleepforge/server run smoke:generic-subresource`

import type { Entry, FieldDef, SubResource } from "@bleepforge/shared";
import { emitTres } from "../emitter.js";
import { parseTres } from "../parser.js";
import { writeFromManifest } from "./orchestrator.js";
import type { RefResolution, WriterContext } from "./types.js";

interface Case {
  name: string;
  source: string;
  entry: Entry;
  json: Record<string, unknown>;
  subResources?: SubResource[];
  resolvers?: Partial<
    Pick<
      WriterContext,
      "resolveRef" | "resolveTextureUid" | "resolveSceneUid" | "resolveScriptByClassName"
    >
  >;
  expectedContains?: string[];
  expectedAbsent?: string[];
  expectedWarnings?: number;
}

function buildEntry(
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

const SCRIPT_TABLE = { resPath: "res://loot/LootTable.cs", uid: "uid://table" };
const SCRIPT_ENTRY = { resPath: "res://loot/LootEntry.cs", uid: "uid://entry" };

function resolveScript(name: string) {
  if (name === "LootTable") return SCRIPT_TABLE;
  if (name === "LootEntry") return SCRIPT_ENTRY;
  return null;
}

function srcEmpty(): string {
  return (
    '[gd_resource type="Resource" load_steps=1 format=3]\n\n' +
    "[resource]\n"
  );
}

// Synthetic source with an existing LootTable wrapping one LootEntry.
function srcWithLootTable(): string {
  return (
    '[gd_resource type="Resource" load_steps=4 format=3]\n\n' +
    '[ext_resource type="Script" uid="uid://table" path="res://loot/LootTable.cs" id="1_table"]\n\n' +
    '[ext_resource type="Script" uid="uid://entry" path="res://loot/LootEntry.cs" id="2_entry"]\n\n' +
    '[sub_resource type="Resource" id="Resource_entryOld"]\n' +
    'script = ExtResource("2_entry")\n' +
    "Chance = 0.5\n" +
    "MinAmount = 1\n" +
    "MaxAmount = 3\n" +
    'metadata/_custom_type_script = "uid://entry"\n\n' +
    '[sub_resource type="Resource" id="Resource_tableOld"]\n' +
    'script = ExtResource("1_table")\n' +
    'Entries = Array[ExtResource("2_entry")]([SubResource("Resource_entryOld")])\n' +
    'metadata/_custom_type_script = "uid://table"\n\n' +
    "[resource]\n" +
    'LootTable = SubResource("Resource_tableOld")\n'
  );
}

const CASES: Case[] = [
  {
    name: "subresource: empty JSON + no existing → noop",
    source: srcEmpty(),
    entry: buildEntry(
      { LootTable: { type: "subresource", of: "LootTable", nullable: true, required: false } },
      ["LootTable"],
    ),
    json: { LootTable: null },
    subResources: [LOOT_TABLE_SUB, LOOT_ENTRY_SUB],
    expectedAbsent: ["LootTable =", "[sub_resource"],
  },
  {
    name: "subresource: null JSON + existing → wrapper + nested entries removed",
    source: srcWithLootTable(),
    entry: buildEntry(
      { LootTable: { type: "subresource", of: "LootTable", nullable: true, required: false } },
      ["LootTable"],
    ),
    json: { LootTable: null },
    subResources: [LOOT_TABLE_SUB, LOOT_ENTRY_SUB],
    expectedAbsent: [
      "LootTable =",
      '[sub_resource type="Resource" id="Resource_tableOld"]',
      '[sub_resource type="Resource" id="Resource_entryOld"]',
    ],
  },
  {
    name: "subresource: non-empty + no existing → mint LootTable + nested Entries",
    source: srcEmpty(),
    entry: buildEntry(
      { LootTable: { type: "subresource", of: "LootTable", nullable: true, required: false } },
      ["LootTable"],
    ),
    json: {
      LootTable: {
        Entries: [{ Chance: 0.75, MinAmount: 2, MaxAmount: 4 }],
      },
    },
    subResources: [LOOT_TABLE_SUB, LOOT_ENTRY_SUB],
    resolvers: { resolveScriptByClassName: resolveScript },
    expectedContains: [
      'type="Script" uid="uid://table"',
      'type="Script" uid="uid://entry"',
      'LootTable = SubResource("',
      "Chance = 0.75",
      "MinAmount = 2",
      "MaxAmount = 4",
      'Entries = Array[ExtResource("',
    ],
  },
  {
    name: "subresource: existing → reconcile in place (Entries array runs through recursion)",
    source: srcWithLootTable(),
    entry: buildEntry(
      { LootTable: { type: "subresource", of: "LootTable", nullable: true, required: false } },
      ["LootTable"],
    ),
    json: {
      LootTable: {
        Entries: [
          { _subId: "Resource_entryOld", Chance: 0.9, MinAmount: 5, MaxAmount: 5 },
        ],
      },
    },
    subResources: [LOOT_TABLE_SUB, LOOT_ENTRY_SUB],
    resolvers: { resolveScriptByClassName: resolveScript },
    expectedContains: [
      // Existing LootTable section is reused (same id).
      'LootTable = SubResource("Resource_tableOld")',
      // Existing Entry sub_resource is reconciled (same id, updated values).
      '[sub_resource type="Resource" id="Resource_entryOld"]',
      "Chance = 0.9",
      "MinAmount = 5",
      "MaxAmount = 5",
    ],
    expectedAbsent: ["Chance = 0.5", "MaxAmount = 3"],
  },
  {
    name: "subresource: missing script UID → warning, line left unchanged",
    source: srcEmpty(),
    entry: buildEntry(
      { LootTable: { type: "subresource", of: "LootTable", nullable: true, required: false } },
      ["LootTable"],
    ),
    json: { LootTable: { Entries: [] } },
    subResources: [LOOT_TABLE_SUB, LOOT_ENTRY_SUB],
    resolvers: { resolveScriptByClassName: () => null },
    expectedAbsent: ["LootTable =", "[sub_resource"],
    expectedWarnings: 1,
  },
  {
    name: "subresource: unknown sub-resource name → warning, line left unchanged",
    source: srcEmpty(),
    entry: buildEntry(
      { Mystery: { type: "subresource", of: "MysteryClass", nullable: true, required: false } },
      ["Mystery"],
    ),
    json: { Mystery: { X: 1 } },
    subResources: [],
    expectedAbsent: ["Mystery =", "[sub_resource"],
    expectedWarnings: 1,
  },
];

function runCase(c: Case): string | null {
  const doc = parseTres(c.source);
  const failOnUnexpectedResolve = (name: string) => () => {
    throw new Error(`unexpected ${name} resolver call`);
  };
  const ctx: WriterContext = {
    godotRoot: "/godot",
    doc,
    warnings: [],
    resolveRef:
      c.resolvers?.resolveRef ?? (failOnUnexpectedResolve("resolveRef") as () => RefResolution | null),
    resolveTextureUid:
      c.resolvers?.resolveTextureUid ?? (failOnUnexpectedResolve("resolveTextureUid") as () => string | null),
    resolveSceneUid:
      c.resolvers?.resolveSceneUid ?? (failOnUnexpectedResolve("resolveSceneUid") as () => string | null),
    resolveScriptByClassName:
      c.resolvers?.resolveScriptByClassName ??
      (failOnUnexpectedResolve("resolveScriptByClassName") as () =>
        | { resPath: string; uid: string }
        | null),
    subResources: new Map((c.subResources ?? []).map((s) => [s.subResource, s])),
  };
  writeFromManifest(doc, c.entry, c.json, ctx);
  const emitted = emitTres(doc);

  const failures: string[] = [];
  for (const needle of c.expectedContains ?? []) {
    if (!emitted.includes(needle)) {
      failures.push(`expected to contain ${JSON.stringify(needle)}`);
    }
  }
  for (const needle of c.expectedAbsent ?? []) {
    if (emitted.includes(needle)) {
      failures.push(`expected NOT to contain ${JSON.stringify(needle)}`);
    }
  }
  const expectedWarnings = c.expectedWarnings ?? 0;
  if (ctx.warnings.length !== expectedWarnings) {
    failures.push(
      `expected ${expectedWarnings} warning(s), got ${ctx.warnings.length}: ${ctx.warnings.join(" | ")}`,
    );
  }

  if (failures.length === 0) return null;
  return `${failures.join("; ")}\n--- emitted ---\n${emitted}\n--- end ---`;
}

let passed = 0;
let failed = 0;
for (const c of CASES) {
  const failure = runCase(c);
  if (failure === null) {
    console.log(`  ok  ${c.name}`);
    passed++;
  } else {
    console.log(`  FAIL ${c.name}`);
    console.log(`       ${failure.replace(/\n/g, "\n       ")}`);
    failed++;
  }
}

console.log(`\n[smoke:generic-subresource] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
