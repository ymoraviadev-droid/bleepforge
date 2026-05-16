// Smoke test for array handler (sub-resource arrays + ref arrays).
//
// In-process against synthetic .tres + manifest entries with stub
// resolvers (subResources Map, resolveScriptByClassName, resolveRef).
// No real ProjectIndex or scriptIndex needed.
//
// Run: `pnpm --filter @bleepforge/server run smoke:generic-arrays`

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

// Builds a `.tres` with [resource] only — for cases starting from a
// blank slate.
function srcEmpty(): string {
  return (
    '[gd_resource type="Resource" load_steps=1 format=3]\n\n' +
    "[resource]\n"
  );
}

// Builds a `.tres` with one pre-existing sub_resource (Delta), an
// existing Deltas property line referencing it, the conventional
// script ext_resource (KarmaDelta.cs), and the [resource] section.
// Used to exercise the reconcileExisting path.
function srcWithOneDelta(faction = 2, amount = 10): string {
  return (
    '[gd_resource type="Resource" load_steps=3 format=3]\n\n' +
    '[ext_resource type="Script" uid="uid://karmaDelta" path="res://shared/karma/KarmaDelta.cs" id="1_kd"]\n\n' +
    '[sub_resource type="Resource" id="Resource_existing"]\n' +
    'script = ExtResource("1_kd")\n' +
    `Faction = ${faction}\n` +
    `Amount = ${amount}\n` +
    'metadata/_custom_type_script = "uid://karmaDelta"\n\n' +
    "[resource]\n" +
    'Deltas = [SubResource("Resource_existing")]\n'
  );
}

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

const KARMA_SCRIPT = {
  resPath: "res://shared/karma/KarmaDelta.cs",
  uid: "uid://karmaDelta",
};

const CASES: Case[] = [
  // ---- Sub-resource arrays ------------------------------------------------
  {
    name: "sub-array: empty + no existing → no property line, no sub_resources",
    source: srcEmpty(),
    entry: buildEntry(
      { Deltas: { type: "array", of: "KarmaDelta", arrayContainerType: "untyped", nullable: false, required: false } },
      ["Deltas"],
    ),
    json: { Deltas: [] },
    subResources: [KARMA_DELTA_SUB],
    expectedAbsent: ["Deltas =", "[sub_resource"],
  },
  {
    name: "sub-array: existing → empty → all sub_resources removed",
    source: srcWithOneDelta(2, 10),
    entry: buildEntry(
      { Deltas: { type: "array", of: "KarmaDelta", arrayContainerType: "untyped", nullable: false, required: false } },
      ["Deltas"],
    ),
    json: { Deltas: [] },
    subResources: [KARMA_DELTA_SUB],
    expectedAbsent: ["Deltas =", '[sub_resource type="Resource" id="Resource_existing"]'],
  },
  {
    name: "sub-array: blank + one new entry → sub_resource minted, property line emitted, untyped form",
    source: srcEmpty(),
    entry: buildEntry(
      { Deltas: { type: "array", of: "KarmaDelta", arrayContainerType: "untyped", nullable: false, required: false } },
      ["Deltas"],
    ),
    json: { Deltas: [{ Faction: "RFF", Amount: 15 }] },
    subResources: [KARMA_DELTA_SUB],
    resolvers: { resolveScriptByClassName: (name) => (name === "KarmaDelta" ? KARMA_SCRIPT : null) },
    expectedContains: [
      'type="Script" uid="uid://karmaDelta" path="res://shared/karma/KarmaDelta.cs"',
      '[sub_resource type="Resource" id="Resource_',
      'script = ExtResource(',
      "Faction = 2",
      "Amount = 15",
      'metadata/_custom_type_script = "uid://karmaDelta"',
      "Deltas = [SubResource(",
    ],
  },
  {
    name: "sub-array: existing _subId match → fields updated in place",
    source: srcWithOneDelta(2, 10),
    entry: buildEntry(
      { Deltas: { type: "array", of: "KarmaDelta", arrayContainerType: "untyped", nullable: false, required: false } },
      ["Deltas"],
    ),
    json: { Deltas: [{ _subId: "Resource_existing", Faction: "Grove", Amount: 25 }] },
    subResources: [KARMA_DELTA_SUB],
    resolvers: { resolveScriptByClassName: (name) => (name === "KarmaDelta" ? KARMA_SCRIPT : null) },
    expectedContains: ["Faction = 3", "Amount = 25", 'Deltas = [SubResource("Resource_existing")]'],
    expectedAbsent: ["Faction = 2", "Amount = 10"],
  },
  {
    name: "sub-array: typed container emits Array[ExtResource(scriptId)]([...])",
    source: srcEmpty(),
    entry: buildEntry(
      { Deltas: { type: "array", of: "KarmaDelta", arrayContainerType: "typed", nullable: false, required: false } },
      ["Deltas"],
    ),
    json: { Deltas: [{ Faction: "FreeRobots", Amount: 5 }] },
    subResources: [KARMA_DELTA_SUB],
    resolvers: { resolveScriptByClassName: () => KARMA_SCRIPT },
    expectedContains: ['Deltas = Array[ExtResource("', "]([SubResource("],
  },
  {
    name: "sub-array: missing script UID → warning, line left unchanged",
    source: srcEmpty(),
    entry: buildEntry(
      { Deltas: { type: "array", of: "KarmaDelta", arrayContainerType: "untyped", nullable: false, required: false } },
      ["Deltas"],
    ),
    json: { Deltas: [{ Faction: "RFF", Amount: 5 }] },
    subResources: [KARMA_DELTA_SUB],
    resolvers: { resolveScriptByClassName: () => null },
    expectedAbsent: ["Deltas =", "[sub_resource"],
    expectedWarnings: 1,
  },
  {
    name: "sub-array: unknown sub-resource name → warning, line left unchanged",
    source: srcEmpty(),
    entry: buildEntry(
      { Deltas: { type: "array", of: "MysteryClass", arrayContainerType: "untyped", nullable: false, required: false } },
      ["Deltas"],
    ),
    json: { Deltas: [{ X: 1 }] },
    subResources: [],
    expectedAbsent: ["Deltas =", "[sub_resource"],
    expectedWarnings: 1,
  },

  // ---- Ref arrays ---------------------------------------------------------
  {
    name: "ref-array: empty → drop line",
    source:
      '[gd_resource type="Resource" load_steps=1 format=3]\n\n' +
      "[resource]\n" +
      'CasualRemarks = Array[Object]([ExtResource("3_old")])\n',
    entry: buildEntry(
      {
        CasualRemarks: {
          type: "array",
          itemRef: { to: "balloon" },
          arrayContainerType: "typed",
          nullable: false,
          required: false,
        },
      },
      ["CasualRemarks"],
    ),
    json: { CasualRemarks: [] },
    expectedAbsent: ["CasualRemarks ="],
  },
  {
    name: "ref-array: one resolved + typed → Array[Object]([ExtResource])",
    source: srcEmpty(),
    entry: buildEntry(
      {
        CasualRemarks: {
          type: "array",
          itemRef: { to: "balloon" },
          arrayContainerType: "typed",
          nullable: false,
          required: false,
        },
      },
      ["CasualRemarks"],
    ),
    json: { CasualRemarks: ["hap_500/greeting"] },
    resolvers: {
      resolveRef: (domain, key) =>
        domain === "balloon" && key === "hap_500/greeting"
          ? { uid: "uid://greet", resPath: "res://characters/npcs/hap_500/balloons/greeting.tres" }
          : null,
    },
    expectedContains: [
      'type="Resource" uid="uid://greet"',
      "CasualRemarks = Array[Object]([ExtResource(",
    ],
  },
  {
    name: "ref-array: untyped → bare [ExtResource(...)]",
    source: srcEmpty(),
    entry: buildEntry(
      {
        Items: {
          type: "array",
          itemRef: { to: "item" },
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["Items"],
    ),
    json: { Items: ["small_gun"] },
    resolvers: {
      resolveRef: (_d, key) =>
        key === "small_gun"
          ? { uid: "uid://gun", resPath: "res://world/collectibles/weapons/data/small_gun.tres" }
          : null,
    },
    expectedContains: ["Items = [ExtResource("],
    expectedAbsent: ["Array[Object]"],
  },
  {
    name: "ref-array: unresolved entry → warning + skipped, others emitted",
    source: srcEmpty(),
    entry: buildEntry(
      {
        Items: {
          type: "array",
          itemRef: { to: "item" },
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["Items"],
    ),
    json: { Items: ["a", "missing"] },
    resolvers: {
      resolveRef: (_d, key) =>
        key === "a" ? { uid: "uid://A", resPath: "res://a.tres" } : null,
    },
    expectedContains: ["Items = [ExtResource("],
    expectedWarnings: 1,
  },
  {
    name: "ref-array: duplicates dedup onto one ext_resource",
    source: srcEmpty(),
    entry: buildEntry(
      {
        Items: {
          type: "array",
          itemRef: { to: "item" },
          arrayContainerType: "untyped",
          nullable: false,
          required: false,
        },
      },
      ["Items"],
    ),
    json: { Items: ["x", "x"] },
    resolvers: {
      resolveRef: () => ({ uid: "uid://x", resPath: "res://x.tres" }),
    },
    // Both array slots reference the SAME ext_resource id.
    expectedContains: ["Items = [ExtResource("],
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

console.log(`\n[smoke:generic-arrays] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
