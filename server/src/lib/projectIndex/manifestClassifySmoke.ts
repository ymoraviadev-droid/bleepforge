// Smoke test for the projectIndex manifest classifier.
//
// Drives `classifyAgainstManifestEntry` directly with synthetic
// manifest entries + synthetic .tres text. Exercises all four entry
// kinds (domain, foldered, enumKeyed, discriminatedFamily) including
// their failure modes (wrong script_class, missing key field,
// parentNameMustBe defense for foldered).
//
// Run: `pnpm --filter @bleepforge/server run smoke:manifest-classify`

import type { Entry } from "@bleepforge/shared";
import { classifyAgainstManifestEntry } from "./build.js";

interface Case {
  name: string;
  entry: Entry;
  text: string;
  absPath: string;
  scriptClass: string | null;
  expectMatch: boolean;
  expectedDomain?: string;
  expectedId?: string;
  expectedFolder?: string | null;
}

const FAKE_ROOT = "/godot";
const FAKE_UID = "uid://abc123";
const FAKE_RES_PATH = "res://fake.tres";

const CASES: Case[] = [
  // ---- kind: "domain" ---------------------------------------------------
  {
    name: 'domain (string key): matches script_class + extracts Id',
    entry: {
      domain: "note",
      kind: "domain",
      class: "Note",
      key: "Id",
      folder: "notes",
      fields: { Id: { type: "string", required: true } },
      fieldOrder: ["Id"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Note"\n[resource]\nId = "welcome"\n',
    absPath: "/godot/notes/welcome.tres",
    scriptClass: "Note",
    expectMatch: true,
    expectedDomain: "note",
    expectedId: "welcome",
    expectedFolder: null,
  },
  {
    name: "domain: wrong script_class → no match",
    entry: {
      domain: "note",
      kind: "domain",
      class: "Note",
      key: "Id",
      folder: "notes",
      fields: { Id: { type: "string", required: true } },
      fieldOrder: ["Id"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="OtherThing"\n[resource]\nId = "x"\n',
    absPath: "/godot/notes/x.tres",
    scriptClass: "OtherThing",
    expectMatch: false,
  },
  {
    name: "domain: missing key field → no match",
    entry: {
      domain: "note",
      kind: "domain",
      class: "Note",
      key: "Id",
      folder: "notes",
      fields: { Id: { type: "string", required: true } },
      fieldOrder: ["Id"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Note"\n[resource]\n',
    absPath: "/godot/notes/orphan.tres",
    scriptClass: "Note",
    expectMatch: false,
  },

  // ---- kind: "foldered" -------------------------------------------------
  {
    name: 'foldered (parentDir): identity = "<folder>/<basename>"',
    entry: {
      domain: "snippet",
      kind: "foldered",
      class: "Snippet",
      key: "Body",
      folderDiscovery: {
        mode: "walk",
        groupBy: "parentDir",
        parentNameMustBe: null,
      },
      fields: { Body: { type: "multiline", required: false } },
      fieldOrder: ["Body"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Snippet"\n[resource]\nBody = "hello"\n',
    absPath: "/godot/snippets/intro/greeting.tres",
    scriptClass: "Snippet",
    expectMatch: true,
    expectedDomain: "snippet",
    expectedId: "intro/greeting",
    expectedFolder: "intro",
  },
  {
    name: 'foldered (grandparentDir + parentNameMustBe): defense check passes',
    entry: {
      domain: "balloonish",
      kind: "foldered",
      class: "Balloon",
      key: "Text",
      folderDiscovery: {
        mode: "walk",
        groupBy: "grandparentDir",
        parentNameMustBe: "balloons",
      },
      fields: { Text: { type: "multiline", required: false } },
      fieldOrder: ["Text"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Balloon"\n[resource]\n',
    absPath: "/godot/npcs/eddie/balloons/hello.tres",
    scriptClass: "Balloon",
    expectMatch: true,
    expectedDomain: "balloonish",
    expectedId: "eddie/hello",
    expectedFolder: "eddie",
  },
  {
    name: "foldered: parentNameMustBe mismatch → defensive skip",
    entry: {
      domain: "balloonish",
      kind: "foldered",
      class: "Balloon",
      key: "Text",
      folderDiscovery: {
        mode: "walk",
        groupBy: "grandparentDir",
        parentNameMustBe: "balloons",
      },
      fields: { Text: { type: "multiline", required: false } },
      fieldOrder: ["Text"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Balloon"\n[resource]\n',
    absPath: "/godot/elsewhere/stray.tres",
    scriptClass: "Balloon",
    expectMatch: false,
  },

  // ---- kind: "enumKeyed" ------------------------------------------------
  {
    name: "enumKeyed: int value maps to enumValues[N]",
    entry: {
      domain: "element",
      kind: "enumKeyed",
      class: "ElementData",
      key: "Element",
      enumValues: ["Fire", "Water", "Earth", "Air"],
      folder: "elements",
      folderLayout: "subfolderPerValue",
      fields: {
        Element: { type: "enum", values: ["Fire", "Water", "Earth", "Air"], required: true },
      },
      fieldOrder: ["Element"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="ElementData"\n[resource]\nElement = 2\n',
    absPath: "/godot/elements/earth.tres",
    scriptClass: "ElementData",
    expectMatch: true,
    expectedDomain: "element",
    expectedId: "Earth",
  },
  {
    name: "enumKeyed: missing line defaults to enumValues[0] (Godot omits enum=0)",
    entry: {
      domain: "element",
      kind: "enumKeyed",
      class: "ElementData",
      key: "Element",
      enumValues: ["Fire", "Water", "Earth", "Air"],
      folder: "elements",
      folderLayout: "subfolderPerValue",
      fields: {
        Element: { type: "enum", values: ["Fire", "Water", "Earth", "Air"], required: true },
      },
      fieldOrder: ["Element"],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="ElementData"\n[resource]\n',
    absPath: "/godot/elements/fire.tres",
    scriptClass: "ElementData",
    expectMatch: true,
    expectedId: "Fire",
  },

  // ---- kind: "discriminatedFamily" -------------------------------------
  {
    name: "discriminatedFamily: base class matches",
    entry: {
      domain: "equipment",
      kind: "discriminatedFamily",
      key: "Slug",
      discriminator: "Type",
      folder: "equipment",
      base: {
        class: "Equipment",
        fields: { Slug: { type: "string", required: true } },
        fieldOrder: ["Slug"],
      },
      variants: [
        { value: "Sword", class: "Sword", extraFields: {}, extraFieldOrder: [] },
        { value: "Shield", class: "Shield", extraFields: {}, extraFieldOrder: [] },
      ],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Equipment"\n[resource]\nSlug = "fists"\n',
    absPath: "/godot/equipment/fists.tres",
    scriptClass: "Equipment",
    expectMatch: true,
    expectedDomain: "equipment",
    expectedId: "fists",
  },
  {
    name: "discriminatedFamily: variant class matches",
    entry: {
      domain: "equipment",
      kind: "discriminatedFamily",
      key: "Slug",
      discriminator: "Type",
      folder: "equipment",
      base: {
        class: "Equipment",
        fields: { Slug: { type: "string", required: true } },
        fieldOrder: ["Slug"],
      },
      variants: [
        { value: "Sword", class: "Sword", extraFields: {}, extraFieldOrder: [] },
        { value: "Shield", class: "Shield", extraFields: {}, extraFieldOrder: [] },
      ],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Sword"\n[resource]\nSlug = "longsword"\n',
    absPath: "/godot/equipment/longsword.tres",
    scriptClass: "Sword",
    expectMatch: true,
    expectedId: "longsword",
  },
  {
    name: "discriminatedFamily: unknown class → no match",
    entry: {
      domain: "equipment",
      kind: "discriminatedFamily",
      key: "Slug",
      discriminator: "Type",
      folder: "equipment",
      base: {
        class: "Equipment",
        fields: { Slug: { type: "string", required: true } },
        fieldOrder: ["Slug"],
      },
      variants: [
        { value: "Sword", class: "Sword", extraFields: {}, extraFieldOrder: [] },
      ],
      view: "list",
      overrideUi: null,
    },
    text: 'script_class="Bow"\n[resource]\nSlug = "shortbow"\n',
    absPath: "/godot/equipment/shortbow.tres",
    scriptClass: "Bow",
    expectMatch: false,
  },
];

let passed = 0;
let failed = 0;
for (const c of CASES) {
  const result = classifyAgainstManifestEntry(
    c.entry,
    c.text,
    c.absPath,
    FAKE_ROOT,
    c.scriptClass,
    FAKE_UID,
    FAKE_RES_PATH,
  );

  const failures: string[] = [];
  if (c.expectMatch && !result) {
    failures.push("expected match, got null");
  } else if (!c.expectMatch && result) {
    failures.push(`expected no match, got ${JSON.stringify(result)}`);
  } else if (result) {
    if (c.expectedDomain !== undefined && result.domain !== c.expectedDomain) {
      failures.push(`domain: expected ${c.expectedDomain}, got ${result.domain}`);
    }
    if (c.expectedId !== undefined && result.id !== c.expectedId) {
      failures.push(`id: expected ${c.expectedId}, got ${result.id}`);
    }
    if (c.expectedFolder !== undefined && result.folder !== c.expectedFolder) {
      failures.push(`folder: expected ${c.expectedFolder}, got ${result.folder}`);
    }
  }

  if (failures.length === 0) {
    console.log(`  ok  ${c.name}`);
    passed++;
  } else {
    console.log(`  FAIL ${c.name}`);
    for (const f of failures) console.log(`       ${f}`);
    failed++;
  }
}

console.log(`\n[smoke:manifest-classify] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
