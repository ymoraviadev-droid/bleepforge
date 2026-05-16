// Smoke test for the generic importer's scalar handlers.
//
// Symmetric with v0.2.7's `../../tres/generic/scalarsSmoke.ts`. Runs
// in-process against a synthetic .tres + manifest entry — no Godot
// project or filesystem needed. Validates the seven scalar handlers
// (string, multiline, int, float, bool, enum, flag), the
// orchestrator's default-aware read (absent property → FieldDef.default
// ?? type-natural zero), and the `showWhen` gating behavior end-to-end.
//
// Pass/fail signal is the process exit code (0 = all pass).
// Run: `pnpm --filter @bleepforge/server run smoke:import-scalars`

import type { Entry, FieldDef } from "@bleepforge/shared";
import { parseTres } from "../tresParser.js";
import { readFromManifest } from "./orchestrator.js";
import type { ReaderContext } from "./types.js";

interface Case {
  name: string;
  source: string;
  entry: Entry;
  expected: Record<string, unknown>;
  expectedWarnings?: number;
}

const SCRIPT_HEADER =
  '[gd_resource type="Resource" script_class="SmokeTest" load_steps=1 format=3]\n\n' +
  '[ext_resource type="Script" uid="uid://smoke" path="res://smoke.cs" id="1_smoke"]\n\n';

const RESOURCE_HEADER = "[resource]\n";
const SCRIPT_LINE = 'script = ExtResource("1_smoke")\n';
const TRAILER = 'metadata/_custom_type_script = "uid://smoke"\n';

function buildSource(body: string): string {
  return SCRIPT_HEADER + RESOURCE_HEADER + SCRIPT_LINE + body + TRAILER;
}

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

const CASES: Case[] = [
  {
    name: "string: present value reads back",
    source: buildSource('Title = "Welcome"\n'),
    entry: buildDomainEntry(
      { Title: { type: "string", required: false } },
      ["Title"],
    ),
    expected: { Title: "Welcome" },
  },
  {
    name: "string: absent uses FieldDef.default",
    source: buildSource(""),
    entry: buildDomainEntry(
      { Title: { type: "string", required: false, default: "Hi" } },
      ["Title"],
    ),
    expected: { Title: "Hi" },
  },
  {
    name: "string: absent without default → empty string",
    source: buildSource(""),
    entry: buildDomainEntry(
      { Title: { type: "string", required: false } },
      ["Title"],
    ),
    expected: { Title: "" },
  },
  {
    name: "multiline: same handler as string, preserves newlines",
    source: buildSource('Body = "line1\\nline2"\n'),
    entry: buildDomainEntry(
      { Body: { type: "multiline", required: false } },
      ["Body"],
    ),
    expected: { Body: "line1\nline2" },
  },
  {
    name: "flag: same handler as string",
    source: buildSource('SetsFlag = "talked_to_eddie"\n'),
    entry: buildDomainEntry(
      { SetsFlag: { type: "flag", required: false } },
      ["SetsFlag"],
    ),
    expected: { SetsFlag: "talked_to_eddie" },
  },
  {
    name: "int: present value reads back (truncates floats)",
    source: buildSource("Quantity = 7\n"),
    entry: buildDomainEntry(
      { Quantity: { type: "int", required: false } },
      ["Quantity"],
    ),
    expected: { Quantity: 7 },
  },
  {
    name: "int: absent uses FieldDef.default",
    source: buildSource(""),
    entry: buildDomainEntry(
      { Quantity: { type: "int", required: false, default: 1 } },
      ["Quantity"],
    ),
    expected: { Quantity: 1 },
  },
  {
    name: "float: present value reads back",
    source: buildSource("TypeSpeed = 30.5\n"),
    entry: buildDomainEntry(
      { TypeSpeed: { type: "float", required: false } },
      ["TypeSpeed"],
    ),
    expected: { TypeSpeed: 30.5 },
  },
  {
    name: "float: absent uses FieldDef.default",
    source: buildSource(""),
    entry: buildDomainEntry(
      { TypeSpeed: { type: "float", required: false, default: 30 } },
      ["TypeSpeed"],
    ),
    expected: { TypeSpeed: 30 },
  },
  {
    name: "bool: present true reads true",
    source: buildSource("IsStackable = true\n"),
    entry: buildDomainEntry(
      { IsStackable: { type: "bool", required: false, default: false } },
      ["IsStackable"],
    ),
    expected: { IsStackable: true },
  },
  {
    name: "bool: absent uses FieldDef.default",
    source: buildSource(""),
    entry: buildDomainEntry(
      { IsStackable: { type: "bool", required: false, default: true } },
      ["IsStackable"],
    ),
    expected: { IsStackable: true },
  },
  {
    name: "enum: present non-zero index → mapped value",
    source: buildSource("Faction = 2\n"),
    entry: buildDomainEntry(
      {
        Faction: {
          type: "enum",
          values: ["Scavengers", "FreeRobots", "RFF", "Grove"],
          required: false,
        },
      },
      ["Faction"],
    ),
    expected: { Faction: "RFF" },
  },
  {
    name: "enum: absent (Godot omits index 0) → values[0]",
    source: buildSource(""),
    entry: buildDomainEntry(
      {
        Faction: {
          type: "enum",
          values: ["Scavengers", "FreeRobots", "RFF", "Grove"],
          required: false,
        },
      },
      ["Faction"],
    ),
    expected: { Faction: "Scavengers" },
  },
  {
    name: "enum: out-of-range index → warning + values[0]",
    source: buildSource("Faction = 99\n"),
    entry: buildDomainEntry(
      {
        Faction: {
          type: "enum",
          values: ["Scavengers", "FreeRobots"],
          required: false,
        },
      },
      ["Faction"],
    ),
    expected: { Faction: "Scavengers" },
    expectedWarnings: 1,
  },
  {
    name: "showWhen: predicate fails → field absent from JSON",
    source: buildSource('Type = 1\nTargetItem = "stale"\n'),
    entry: buildDomainEntry(
      {
        Type: {
          type: "enum",
          values: ["CollectItem", "KillNpc"],
          required: false,
        },
        TargetItem: {
          type: "string",
          required: false,
          showWhen: { Type: "CollectItem" },
        },
      },
      ["Type", "TargetItem"],
    ),
    // Type=KillNpc, so TargetItem's showWhen gates it out of JSON.
    // The .tres has a stale TargetItem line, but the reader skips it.
    expected: { Type: "KillNpc" },
  },
  {
    name: "showWhen: predicate passes → field present",
    source: buildSource('Type = 0\nTargetItem = "rusty_keycard"\n'),
    entry: buildDomainEntry(
      {
        Type: {
          type: "enum",
          values: ["CollectItem", "KillNpc"],
          required: false,
        },
        TargetItem: {
          type: "string",
          required: false,
          showWhen: { Type: "CollectItem" },
        },
      },
      ["Type", "TargetItem"],
    ),
    expected: { Type: "CollectItem", TargetItem: "rusty_keycard" },
  },
];

function runCase(c: Case): string | null {
  const parsed = parseTres(c.source);
  const ctx: ReaderContext = {
    godotRoot: "/tmp/smoke",
    filePath: "/tmp/smoke.tres",
    parsed,
    warnings: [],
    // Scalar smoke never hits ref/texture handlers — defensive null.
    resolveRefByExtResource: () => null,
    resPathToAbs: (p) => p,
    subResources: new Map(),
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
