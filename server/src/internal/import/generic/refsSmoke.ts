// Smoke test for the generic importer's ref / texture / scene handlers.
//
// Each handler takes an ExtResource(id) value, looks up the resource in
// ParsedTres.extResources, then either resolves (ref → entity id;
// texture → absolute fs path; scene → res:// path verbatim) or falls
// back gracefully (ref dangling → res:// path; texture AtlasTexture
// sub_resource → "" so the writer preserves it).
//
// Pass/fail signal is the process exit code (0 = all pass).
// Run: `pnpm --filter @bleepforge/server run smoke:import-refs`

import type { Entry, FieldDef } from "@bleepforge/shared";
import { parseTres, type TresExtResource } from "../tresParser.js";
import { readFromManifest } from "./orchestrator.js";
import type { ReaderContext } from "./types.js";

interface Case {
  name: string;
  source: string;
  entry: Entry;
  expected: Record<string, unknown>;
  expectedWarnings?: number;
  // Per-case ref resolver — keyed by target domain.
  refResolutions?: Record<string, Record<string, string>>;
}

const HEADER_BASE =
  '[gd_resource type="Resource" script_class="SmokeTest" load_steps=3 format=3]\n\n' +
  '[ext_resource type="Script" uid="uid://smoke" path="res://smoke.cs" id="1_smoke"]\n';

function buildSource(extras: string, body: string): string {
  return (
    HEADER_BASE +
    extras +
    "\n" +
    "[resource]\n" +
    'script = ExtResource("1_smoke")\n' +
    body +
    'metadata/_custom_type_script = "uid://smoke"\n'
  );
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
    name: "ref: resolves through resolver to target domain entity id",
    source: buildSource(
      '[ext_resource type="Resource" uid="uid://item_kc" path="res://items/keycard.tres" id="2_kc"]',
      'TargetItem = ExtResource("2_kc")\n',
    ),
    entry: buildDomainEntry(
      { TargetItem: { type: "ref", to: "item", required: false } },
      ["TargetItem"],
    ),
    refResolutions: { item: { "res://items/keycard.tres": "rusty_keycard" } },
    expected: { TargetItem: "rusty_keycard" },
  },
  {
    name: "ref: dangling resolver → verbatim res:// + warning",
    source: buildSource(
      '[ext_resource type="Resource" uid="uid://item_x" path="res://items/missing.tres" id="2_x"]',
      'TargetItem = ExtResource("2_x")\n',
    ),
    entry: buildDomainEntry(
      { TargetItem: { type: "ref", to: "item", required: false } },
      ["TargetItem"],
    ),
    refResolutions: {},
    expected: { TargetItem: "res://items/missing.tres" },
    expectedWarnings: 1,
  },
  {
    name: "ref: absent → FieldDef.default ?? empty string",
    source: buildSource("", ""),
    entry: buildDomainEntry(
      { TargetItem: { type: "ref", to: "item", required: false } },
      ["TargetItem"],
    ),
    expected: { TargetItem: "" },
  },
  {
    name: "texture: ExtResource ref → absolute fs path",
    source: buildSource(
      '[ext_resource type="Texture2D" uid="uid://icon_kc" path="res://items/keycard.png" id="2_icon"]',
      'Icon = ExtResource("2_icon")\n',
    ),
    entry: buildDomainEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    expected: { Icon: "/godot/items/keycard.png" },
  },
  {
    name: "texture: SubResource (AtlasTexture) → empty string (preserve contract)",
    source:
      HEADER_BASE +
      "\n" +
      '[sub_resource type="AtlasTexture" id="atlas_1"]\n' +
      "region = Rect2(0, 0, 32, 32)\n\n" +
      "[resource]\n" +
      'script = ExtResource("1_smoke")\n' +
      'Icon = SubResource("atlas_1")\n' +
      'metadata/_custom_type_script = "uid://smoke"\n',
    entry: buildDomainEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    expected: { Icon: "" },
  },
  {
    name: "texture: absent → empty string",
    source: buildSource("", ""),
    entry: buildDomainEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    expected: { Icon: "" },
  },
  {
    name: "scene: ExtResource ref → res:// path verbatim",
    source: buildSource(
      '[ext_resource type="PackedScene" uid="uid://pickup_1" path="res://world/collectibles/keycard/keycard.tscn" id="2_scn"]',
      'PickupScene = ExtResource("2_scn")\n',
    ),
    entry: buildDomainEntry(
      { PickupScene: { type: "scene", required: false } },
      ["PickupScene"],
    ),
    expected: {
      PickupScene: "res://world/collectibles/keycard/keycard.tscn",
    },
  },
  {
    name: "scene: absent → empty string",
    source: buildSource("", ""),
    entry: buildDomainEntry(
      { PickupScene: { type: "scene", required: false } },
      ["PickupScene"],
    ),
    expected: { PickupScene: "" },
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
    // Trivial /godot-rooted resolver — strips res:// → joins with /godot.
    resPathToAbs: (p) => (p.startsWith("res://") ? "/godot/" + p.substring(6) : p),
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
