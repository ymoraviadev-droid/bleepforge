// Smoke test for ref / texture / scene handlers.
//
// In-process against synthetic .tres + manifest entries — no real
// Godot project or ProjectIndex needed. Resolvers are stubbed in each
// case to drive specific code paths (resolved / unresolved /
// AtlasTexture preservation / dedup). Pass/fail signal is the process
// exit code.
//
// Run: `pnpm --filter @bleepforge/server run smoke:generic-refs`

import type { Entry, FieldDef } from "@bleepforge/shared";
import { emitTres } from "../emitter.js";
import { parseTres } from "../parser.js";
import { writeFromManifest } from "./orchestrator.js";
import type { RefResolution, WriterContext } from "./types.js";

interface Case {
  name: string;
  source: string;
  entry: Entry;
  json: Record<string, unknown>;
  resolvers?: Partial<Pick<WriterContext, "resolveRef" | "resolveTextureUid" | "resolveSceneUid">>;
  godotRoot?: string;
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

// ---- Source builders -------------------------------------------------------
// Each builder produces a small but valid .tres source with the [resource]
// section pre-populated to match the case's expected starting state.

function srcEmpty(): string {
  return (
    '[gd_resource type="Resource" load_steps=1 format=3]\n\n' +
    "[resource]\n"
  );
}

function srcWithExisting(propLine: string): string {
  return srcEmpty() + propLine + "\n";
}

function srcWithAtlasTexture(): string {
  // [gd_resource] + sheet ext_resource + AtlasTexture sub_resource + [resource]
  // with Icon = SubResource. Mimics the FoB items that use atlas regions.
  return (
    '[gd_resource type="Resource" load_steps=3 format=3]\n\n' +
    '[ext_resource type="Texture2D" uid="uid://sheet" path="res://art/sheet.png" id="1_sheet"]\n\n' +
    '[sub_resource type="AtlasTexture" id="atlas_xyz"]\n' +
    'atlas = ExtResource("1_sheet")\n' +
    "region = Rect2(0, 0, 32, 32)\n\n" +
    "[resource]\n" +
    'Icon = SubResource("atlas_xyz")\n'
  );
}

const CASES: Case[] = [
  // ---- ref handler -------------------------------------------------------
  {
    name: "ref: empty value → line omitted",
    source: srcWithExisting('Quest = ExtResource("3_xxx")'),
    entry: buildEntry(
      { Quest: { type: "ref", to: "quest", required: false } },
      ["Quest"],
    ),
    json: { Quest: "" },
    expectedAbsent: ["Quest ="],
  },
  {
    name: "ref: resolver returns entry → ext_resource minted and referenced",
    source: srcEmpty(),
    entry: buildEntry(
      { Quest: { type: "ref", to: "quest", required: false } },
      ["Quest"],
    ),
    json: { Quest: "rescue_eddie" },
    resolvers: {
      resolveRef: (domain, key) =>
        domain === "quest" && key === "rescue_eddie"
          ? { uid: "uid://questA", resPath: "res://quests/rescue_eddie.tres" }
          : null,
    },
    expectedContains: [
      'type="Resource" uid="uid://questA" path="res://quests/rescue_eddie.tres"',
      "Quest = ExtResource(",
    ],
  },
  {
    name: "ref: resolver returns null → warning + line dropped",
    source: srcWithExisting('Quest = ExtResource("3_old")'),
    entry: buildEntry(
      { Quest: { type: "ref", to: "quest", required: false } },
      ["Quest"],
    ),
    json: { Quest: "nonexistent" },
    resolvers: { resolveRef: () => null },
    expectedAbsent: ["Quest ="],
    expectedWarnings: 1,
  },
  {
    name: "ref: two fields referencing same target dedup onto one ext_resource",
    source: srcEmpty(),
    entry: buildEntry(
      {
        First: { type: "ref", to: "dialog", required: false },
        Second: { type: "ref", to: "dialog", required: false },
      },
      ["First", "Second"],
    ),
    json: { First: "intro", Second: "intro" },
    resolvers: {
      resolveRef: (_d, key) =>
        key === "intro"
          ? { uid: "uid://intro", resPath: "res://dialogs/intro.tres" }
          : null,
    },
    expectedContains: ["First = ExtResource(", "Second = ExtResource("],
  },

  // ---- texture handler ---------------------------------------------------
  {
    name: "texture: empty + no existing line → noop",
    source: srcEmpty(),
    entry: buildEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    json: { Icon: "" },
    expectedAbsent: ["Icon ="],
  },
  {
    name: "texture: empty + existing ExtResource → line removed",
    source: srcWithExisting('Icon = ExtResource("9_old")'),
    entry: buildEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    json: { Icon: "" },
    expectedAbsent: ["Icon ="],
  },
  {
    name: "texture: empty + AtlasTexture SubResource → preserved verbatim",
    source: srcWithAtlasTexture(),
    entry: buildEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    json: { Icon: "" },
    godotRoot: "/godot",
    expectedContains: [
      'Icon = SubResource("atlas_xyz")',
      '[sub_resource type="AtlasTexture" id="atlas_xyz"]',
    ],
  },
  {
    name: "texture: non-empty path under godotRoot → Texture2D ext_resource minted",
    source: srcEmpty(),
    entry: buildEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    json: { Icon: "/godot/art/icon.png" },
    godotRoot: "/godot",
    resolvers: { resolveTextureUid: () => "uid://iconpng" },
    expectedContains: [
      'type="Texture2D" uid="uid://iconpng" path="res://art/icon.png"',
      "Icon = ExtResource(",
    ],
  },
  {
    name: "texture: path outside godotRoot → warning, line unchanged",
    source: srcWithExisting('Icon = ExtResource("9_old")'),
    entry: buildEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    json: { Icon: "/elsewhere/icon.png" },
    godotRoot: "/godot",
    resolvers: { resolveTextureUid: () => null },
    expectedContains: ['Icon = ExtResource("9_old")'],
    expectedWarnings: 1,
  },
  {
    name: "texture: swap AtlasTexture → Texture2D drops orphaned sub_resource",
    source: srcWithAtlasTexture(),
    entry: buildEntry(
      { Icon: { type: "texture", required: false } },
      ["Icon"],
    ),
    json: { Icon: "/godot/art/new_icon.png" },
    godotRoot: "/godot",
    resolvers: { resolveTextureUid: () => "uid://newicon" },
    expectedContains: ["Icon = ExtResource(", 'type="Texture2D" uid="uid://newicon"'],
    expectedAbsent: ['[sub_resource type="AtlasTexture" id="atlas_xyz"]'],
  },

  // ---- scene handler -----------------------------------------------------
  {
    name: "scene: empty → omit",
    source: srcWithExisting('Scene = ExtResource("3_old")'),
    entry: buildEntry(
      { Scene: { type: "scene", required: false } },
      ["Scene"],
    ),
    json: { Scene: "" },
    expectedAbsent: ["Scene ="],
  },
  {
    name: "scene: res:// path + resolver → PackedScene ext_resource minted",
    source: srcEmpty(),
    entry: buildEntry(
      { Scene: { type: "scene", required: false } },
      ["Scene"],
    ),
    json: { Scene: "res://world/pickup.tscn" },
    resolvers: { resolveSceneUid: () => "uid://pickup" },
    expectedContains: [
      'type="PackedScene" uid="uid://pickup" path="res://world/pickup.tscn"',
      "Scene = ExtResource(",
    ],
  },
  {
    name: "scene: absolute path under godotRoot is normalized to res://",
    source: srcEmpty(),
    entry: buildEntry(
      { Scene: { type: "scene", required: false } },
      ["Scene"],
    ),
    json: { Scene: "/godot/world/pickup.tscn" },
    godotRoot: "/godot",
    resolvers: { resolveSceneUid: () => "uid://pickup2" },
    expectedContains: ['path="res://world/pickup.tscn"'],
  },
  {
    name: "scene: resolver returns null → warning + line dropped",
    source: srcEmpty(),
    entry: buildEntry(
      { Scene: { type: "scene", required: false } },
      ["Scene"],
    ),
    json: { Scene: "res://world/missing.tscn" },
    resolvers: { resolveSceneUid: () => null },
    expectedAbsent: ["Scene ="],
    expectedWarnings: 1,
  },
];

function runCase(c: Case): string | null {
  const doc = parseTres(c.source);
  const failOnUnexpectedResolve = (name: string) => () => {
    throw new Error(`unexpected ${name} resolver call`);
  };
  const ctx: WriterContext = {
    godotRoot: c.godotRoot ?? "/godot",
    doc,
    warnings: [],
    resolveRef: c.resolvers?.resolveRef ?? (failOnUnexpectedResolve("resolveRef") as () => RefResolution | null),
    resolveTextureUid:
      c.resolvers?.resolveTextureUid ?? (failOnUnexpectedResolve("resolveTextureUid") as () => string | null),
    resolveSceneUid:
      c.resolvers?.resolveSceneUid ?? (failOnUnexpectedResolve("resolveSceneUid") as () => string | null),
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

console.log(`\n[smoke:generic-refs] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
