// Smoke test for the generic mapper's scalar handlers.
//
// Runs in-process against a synthetic .tres + manifest entry — no
// Godot project or filesystem needed. Validates the seven scalar
// handlers (string, multiline, int, float, bool, enum, flag), the
// orchestrator's default-aware emit, and the `showWhen` gating
// behavior end-to-end.
//
// Why a runnable script rather than a unit test framework: the server
// workspace doesn't ship one (consistent with the rest of the codebase
// — see canary.ts, harness.ts, test-mutations.ts for the pattern), and
// the cost of one more script here is lower than introducing a new
// test runner just for this commit. The script's pass/fail signal is
// the process exit code, which is enough for pre-commit + CI.
//
// Run: `pnpm --filter @bleepforge/server run smoke:generic`

import type { Entry, FieldDef } from "@bleepforge/shared";
import { emitTres } from "../emitter.js";
import { parseTres } from "../parser.js";
import { writeFromManifest } from "./orchestrator.js";
import type { WriterContext } from "./types.js";

interface Case {
  name: string;
  source: string;
  entry: Entry;
  json: Record<string, unknown>;
  expectedContains?: string[];
  expectedAbsent?: string[];
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

// Convenience: builds a `domain` entry with the given fields/fieldOrder
// plus the conventional script + metadata lines that every FoB .tres
// carries (kept outside the manifest because they're not user-authored).
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
    fields: {
      script: { type: "string", required: false },
      ...fields,
      "metadata/_custom_type_script": { type: "string", required: false },
    },
    fieldOrder: ["script", ...fieldOrder, "metadata/_custom_type_script"],
    view: "list",
    overrideUi: null,
  };
}

const CASES: Case[] = [
  {
    name: "string: non-default value is emitted",
    source: buildSource(""),
    entry: buildDomainEntry(
      { Title: { type: "string", required: false } },
      ["Title"],
    ),
    json: { Title: "Welcome" },
    expectedContains: ['Title = "Welcome"'],
  },
  {
    name: "string: default value omits the line",
    source: buildSource('Title = "old"\n'),
    entry: buildDomainEntry(
      { Title: { type: "string", required: false } },
      ["Title"],
    ),
    json: { Title: "" },
    expectedAbsent: ["Title ="],
  },
  {
    name: "string: declared default matches → omit",
    source: buildSource('Greeting = "Hello"\n'),
    entry: buildDomainEntry(
      {
        Greeting: { type: "string", required: false, default: "Hello" },
      },
      ["Greeting"],
    ),
    json: { Greeting: "Hello" },
    expectedAbsent: ["Greeting ="],
  },
  {
    name: "multiline: same shape as string, with \\n escape",
    source: buildSource(""),
    entry: buildDomainEntry(
      { Body: { type: "multiline", required: false } },
      ["Body"],
    ),
    json: { Body: "line one\nline two" },
    expectedContains: ['Body = "line one\\nline two"'],
  },
  {
    name: "flag: empty → omit; non-empty → emit",
    source: buildSource(""),
    entry: buildDomainEntry(
      { ActiveFlag: { type: "flag", required: false } },
      ["ActiveFlag"],
    ),
    json: { ActiveFlag: "quest_active_foo" },
    expectedContains: ['ActiveFlag = "quest_active_foo"'],
  },
  {
    name: "int: non-zero emitted bare",
    source: buildSource(""),
    entry: buildDomainEntry(
      { Count: { type: "int", required: false } },
      ["Count"],
    ),
    json: { Count: 42 },
    expectedContains: ["Count = 42"],
  },
  {
    name: "int: zero (default) → omit",
    source: buildSource("Count = 5\n"),
    entry: buildDomainEntry(
      { Count: { type: "int", required: false } },
      ["Count"],
    ),
    json: { Count: 0 },
    expectedAbsent: ["Count ="],
  },
  {
    name: "int: declared default → omit on match",
    source: buildSource(""),
    entry: buildDomainEntry(
      {
        MaxStack: { type: "int", required: false, default: 99 },
      },
      ["MaxStack"],
    ),
    json: { MaxStack: 99 },
    expectedAbsent: ["MaxStack ="],
  },
  {
    name: "float: whole number emits with .0 suffix",
    source: buildSource(""),
    entry: buildDomainEntry(
      { TypeSpeed: { type: "float", required: false } },
      ["TypeSpeed"],
    ),
    json: { TypeSpeed: 30 },
    expectedContains: ["TypeSpeed = 30.0"],
  },
  {
    name: "float: decimal preserved as-is",
    source: buildSource(""),
    entry: buildDomainEntry(
      { HoldDuration: { type: "float", required: false } },
      ["HoldDuration"],
    ),
    json: { HoldDuration: 2.5 },
    expectedContains: ["HoldDuration = 2.5"],
  },
  {
    name: "float: zero default → omit",
    source: buildSource("HoldDuration = 4.0\n"),
    entry: buildDomainEntry(
      { HoldDuration: { type: "float", required: false } },
      ["HoldDuration"],
    ),
    json: { HoldDuration: 0 },
    expectedAbsent: ["HoldDuration ="],
  },
  {
    name: "bool: true emitted; false (default) omitted",
    source: buildSource(""),
    entry: buildDomainEntry(
      { CanDrop: { type: "bool", required: false } },
      ["CanDrop"],
    ),
    json: { CanDrop: true },
    expectedContains: ["CanDrop = true"],
  },
  {
    name: "bool: false matches default → omit",
    source: buildSource("CanDrop = true\n"),
    entry: buildDomainEntry(
      { CanDrop: { type: "bool", required: false } },
      ["CanDrop"],
    ),
    json: { CanDrop: false },
    expectedAbsent: ["CanDrop ="],
  },
  {
    name: "enum: emit as int index for non-default value",
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
    json: { Faction: "RFF" },
    expectedContains: ["Faction = 2"],
  },
  {
    name: "enum: first value is default → omit",
    source: buildSource("Faction = 1\n"),
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
    json: { Faction: "Scavengers" },
    expectedAbsent: ["Faction ="],
  },
  {
    name: "showWhen: predicate fails → line removed even if JSON set",
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
    // Type is "KillNpc" now (index 1, non-default → emitted). JSON still
    // carries TargetItem, but showWhen excludes it; line must drop.
    json: { Type: "KillNpc", TargetItem: "rusty_keycard" },
    expectedContains: ["Type = 1"],
    expectedAbsent: ["TargetItem ="],
  },
  {
    name: "showWhen: predicate passes → line stays",
    source: buildSource(""),
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
    json: { Type: "CollectItem", TargetItem: "rusty_keycard" },
    expectedContains: ['TargetItem = "rusty_keycard"'],
  },
];

function runCase(c: Case): string | null {
  const doc = parseTres(c.source);
  const ctx: WriterContext = {
    godotRoot: "/tmp/smoke",
    doc,
    warnings: [],
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

console.log(`\n[smoke:generic-scalars] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
