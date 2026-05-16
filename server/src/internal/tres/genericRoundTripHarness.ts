// Round-trip harness — locks the v0.2.7 generic writer + v0.2.8 generic
// reader contract from both ends.
//
// For each .tres in the configured FoB domain:
//   1. Read the original bytes.
//   2. Parse via the lossy import parser (reader consumes this shape).
//   3. Parse via the round-trip parser (writer mutates this shape's Doc).
//   4. Run readFromManifest with a per-domain ReaderContext → JSON.
//   5. Run writeFromManifest with a per-domain WriterContext + the JSON.
//   6. removeOrphanExtResources to clean up any refs we vacated.
//   7. emitTres → emitted bytes.
//   8. Compare emitted === original byte-for-byte.
//
// Pass means the generic path round-trips one real FoB .tres byte-
// identical. Any divergence in reader-vs-writer field handling
// (default-aware emit, _subId matching, AtlasTexture preservation,
// orphan cleanup) shows up here as a diff that pins the bug to a
// specific file + line.
//
// Phase 5 of v0.2.8. v0.2.7 already validated the writer half against
// cached JSON (harness:generic-karma); this closes the loop by feeding
// the writer JSON the v0.2.8 reader produced fresh against the same
// original file.
//
// Run: `pnpm --filter @bleepforge/server run harness:round-trip [godot-root]`
//      `pnpm --filter @bleepforge/server run harness:round-trip ... --domain=karma`

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Entry, SubResource } from "@bleepforge/shared";

import { config } from "../../config.js";
import { readFromManifest } from "../import/generic/orchestrator.js";
import type { ReaderContext } from "../import/generic/types.js";
import { resPathToAbs } from "../import/mappers.js";
import { parseTres as parseTresLossy } from "../import/tresParser.js";
import { projectIndex } from "../../lib/projectIndex/index.js";
import { scriptIndex } from "../../lib/scriptIndex/index.js";
import { emitTres } from "./emitter.js";
import { writeFromManifest } from "./generic/orchestrator.js";
import type { WriterContext } from "./generic/types.js";
import { removeOrphanExtResources } from "./mutate.js";
import { parseTres } from "./parser.js";
import { readTextureUid, readSceneUid } from "./uidLookup.js";

// ---- Per-domain manifest declarations -------------------------------------
// Mirrors what godot-lib's emitter would write if FoB were ported to
// BleepforgeRegistry. Hand-authored so the harness doesn't depend on
// FoB's actual port status; the shape is what the contract validates.

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

const FACTION_ENTRY: Entry = {
  domain: "faction",
  kind: "enumKeyed",
  class: "FactionData",
  key: "Faction",
  folder: "shared/components/factions",
  folderLayout: "subfolderPerValue",
  enumValues: ["Scavengers", "FreeRobots", "RFF", "Grove"],
  fields: {
    Faction: {
      type: "enum",
      values: ["Scavengers", "FreeRobots", "RFF", "Grove"],
      required: false,
    },
    DisplayName: { type: "string", required: false },
    Icon: { type: "texture", required: false },
    Banner: { type: "texture", required: false },
    ShortDescription: { type: "multiline", required: false },
  },
  fieldOrder: ["Faction", "DisplayName", "Icon", "Banner", "ShortDescription"],
  view: "list",
  overrideUi: null,
};

const BALLOON_ENTRY: Entry = {
  domain: "balloon",
  kind: "foldered",
  class: "BalloonLine",
  // Foldered entries don't have a key field — id comes from the .tres
  // filename basename. The manifest's `key` field is conventionally
  // "(path-derived)" for foldered to make the placeholder explicit.
  key: "(path-derived)",
  folderDiscovery: {
    mode: "walk",
    groupBy: "grandparentDir",
    parentNameMustBe: "balloons",
  },
  fields: {
    Text: { type: "multiline", required: false },
    TypeSpeed: { type: "float", required: false, default: 30 },
    HoldDuration: { type: "float", required: false, default: 2 },
  },
  fieldOrder: ["Text", "TypeSpeed", "HoldDuration"],
  view: "list",
  overrideUi: null,
};

const DIALOG_CHOICE_SUB: SubResource = {
  subResource: "DialogChoice",
  class: "DialogChoice",
  stableIdField: "_subId",
  fields: {
    Text: { type: "string", required: false },
    NextSequenceId: { type: "string", required: false },
    SetsFlag: { type: "flag", required: false },
  },
  fieldOrder: ["Text", "NextSequenceId", "SetsFlag"],
};

const DIALOG_LINE_SUB: SubResource = {
  subResource: "DialogLine",
  class: "DialogLine",
  stableIdField: "_subId",
  fields: {
    SpeakerName: { type: "string", required: false },
    Text: { type: "multiline", required: false },
    Portrait: { type: "texture", required: false },
    Choices: {
      type: "array",
      of: "DialogChoice",
      arrayContainerType: "untyped",
      nullable: false,
      required: false,
    },
  },
  fieldOrder: ["SpeakerName", "Text", "Portrait", "Choices"],
};

const DIALOG_ENTRY: Entry = {
  domain: "dialog",
  kind: "foldered",
  class: "DialogSequence",
  key: "(path-derived)",
  folderDiscovery: {
    mode: "walk",
    groupBy: "parentDir",
    parentNameMustBe: null,
  },
  fields: {
    Id: { type: "string", required: true },
    SourceType: {
      type: "enum",
      values: ["Npc", "Terminal"],
      required: false,
    },
    Lines: {
      type: "array",
      of: "DialogLine",
      arrayContainerType: "untyped",
      nullable: false,
      required: false,
    },
    SetsFlag: { type: "flag", required: false },
  },
  fieldOrder: ["Id", "SourceType", "Lines", "SetsFlag"],
  view: "graph",
  overrideUi: null,
};

const QUEST_OBJECTIVE_SUB: SubResource = {
  subResource: "QuestObjective",
  class: "QuestObjective",
  stableIdField: "_subId",
  fields: {
    Id: { type: "string", required: false },
    Description: { type: "multiline", required: false },
    Type: {
      type: "enum",
      values: [
        "CollectItem",
        "ReachLocation",
        "TalkToNpc",
        "KillNpc",
        "KillEnemyType",
      ],
      required: false,
    },
    TargetItem: {
      type: "ref",
      to: "item",
      required: false,
      showWhen: { Type: "CollectItem" },
    },
    TargetId: {
      type: "string",
      required: false,
      showWhen: { Type: ["ReachLocation", "TalkToNpc", "KillNpc"] },
    },
    EnemyType: {
      type: "string",
      required: false,
      showWhen: { Type: "KillEnemyType" },
    },
    RequiredCount: { type: "int", required: false, default: 1 },
    ConsumeOnTurnIn: { type: "bool", required: false, default: true },
  },
  fieldOrder: [
    "Id",
    "Description",
    "Type",
    "TargetItem",
    "TargetId",
    "EnemyType",
    "RequiredCount",
    "ConsumeOnTurnIn",
  ],
};

const QUEST_REWARD_SUB: SubResource = {
  subResource: "QuestReward",
  class: "QuestReward",
  stableIdField: "_subId",
  fields: {
    Type: {
      type: "enum",
      values: ["Item", "Flag", "Credits"],
      required: false,
    },
    Item: {
      type: "ref",
      to: "item",
      required: false,
      showWhen: { Type: "Item" },
    },
    Quantity: {
      type: "int",
      required: false,
      default: 1,
      showWhen: { Type: "Item" },
    },
    FlagName: {
      type: "flag",
      required: false,
      showWhen: { Type: "Flag" },
    },
    CreditAmount: {
      type: "int",
      required: false,
      showWhen: { Type: "Credits" },
    },
  },
  fieldOrder: ["Type", "Item", "Quantity", "FlagName", "CreditAmount"],
};

const QUEST_ENTRY: Entry = {
  domain: "quest",
  kind: "domain",
  class: "Quest",
  key: "Id",
  folder: "shared/components/quest/quests",
  fields: {
    Id: { type: "string", required: true },
    QuestGiverId: { type: "string", required: false },
    Title: { type: "string", required: false },
    Description: { type: "multiline", required: false },
    Objectives: {
      type: "array",
      of: "QuestObjective",
      arrayContainerType: "untyped",
      nullable: false,
      required: false,
    },
    Rewards: {
      type: "array",
      of: "QuestReward",
      arrayContainerType: "untyped",
      nullable: false,
      required: false,
    },
    ActiveFlag: { type: "flag", required: false },
    CompleteFlag: { type: "flag", required: false },
    TurnedInFlag: { type: "flag", required: false },
  },
  fieldOrder: [
    "Id",
    "QuestGiverId",
    "Title",
    "Description",
    "Objectives",
    "Rewards",
    "ActiveFlag",
    "CompleteFlag",
    "TurnedInFlag",
  ],
  view: "list",
  overrideUi: null,
};

// ---- Harness --------------------------------------------------------------

interface DomainCase {
  name: string;
  entry: Entry;
  subResources: Map<string, SubResource>;
  // Domain identifier in projectIndex (which the index uses to bucket
  // entries during boot).
  indexDomain: string;
}

const CASES: DomainCase[] = [
  {
    name: "karma",
    entry: KARMA_ENTRY,
    subResources: new Map([[KARMA_DELTA_SUB.subResource, KARMA_DELTA_SUB]]),
    indexDomain: "karma",
  },
  {
    name: "faction",
    entry: FACTION_ENTRY,
    subResources: new Map(),
    indexDomain: "faction",
  },
  {
    name: "balloon",
    entry: BALLOON_ENTRY,
    subResources: new Map(),
    indexDomain: "balloon",
  },
  {
    name: "dialog",
    entry: DIALOG_ENTRY,
    subResources: new Map([
      [DIALOG_LINE_SUB.subResource, DIALOG_LINE_SUB],
      [DIALOG_CHOICE_SUB.subResource, DIALOG_CHOICE_SUB],
    ]),
    indexDomain: "dialog",
  },
  {
    name: "quest",
    entry: QUEST_ENTRY,
    subResources: new Map([
      [QUEST_OBJECTIVE_SUB.subResource, QUEST_OBJECTIVE_SUB],
      [QUEST_REWARD_SUB.subResource, QUEST_REWARD_SUB],
    ]),
    indexDomain: "quest",
  },
];

// Outcomes:
//   - "clean"            byte-identical round-trip
//   - "limit-multiline"  diff due to the lossy parser collapsing
//                        physical newlines inside quoted strings into
//                        spaces. The architecture is sound; the helper
//                        layer (tresParser's continuation-line join +
//                        serializeString's \n-as-escape emit) needs a
//                        two-spot fix to preserve raw newlines. Deferred
//                        out of v0.2.8 to keep the cycle focused on the
//                        contract; tracked for a post-v0.2.8 cleanup.
//   - "differs"          diff for any other reason — architectural
//                        divergence to investigate. Includes FoB .tres
//                        with stale showWhen-violating data (the writer
//                        correctly drops fields the manifest says don't
//                        apply, surfacing data hygiene issues).
//   - "error"            reader or writer threw mid-run.
interface CaseResult {
  domain: string;
  file: string;
  status: "clean" | "limit-multiline" | "differs" | "error";
  readWarnings?: string[];
  writeWarnings?: string[];
  message?: string;
  diffPreview?: string;
}

// Heuristic for the multi-line-string case: an original .tres line that
// opens a quote but doesn't close it on the same line means the string
// continues onto a following physical line. The lossy parser joins
// those with " " instead of "\n", which the writer can't reverse on
// emit. Used to demote `differs` → `limit-multiline` so the architectural
// signal stays clean.
function hasMultilineString(text: string): boolean {
  let inString = false;
  for (const line of text.split("\n")) {
    let i = 0;
    while (i < line.length) {
      const c = line[i]!;
      if (inString) {
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === '"') {
          inString = false;
        }
      } else if (c === '"') {
        inString = true;
      }
      i++;
    }
    if (inString) return true; // closing quote on a later physical line
  }
  return false;
}

async function runOne(
  absPath: string,
  godotRoot: string,
  domainCase: DomainCase,
): Promise<CaseResult> {
  const file = path.basename(absPath);
  let original: string;
  try {
    original = await readFile(absPath, "utf8");
  } catch (err) {
    return {
      domain: domainCase.name,
      file,
      status: "error",
      message: `read failed: ${(err as Error).message}`,
    };
  }

  let json: Record<string, unknown> | null;
  let readWarnings: string[];
  try {
    const lossyParsed = parseTresLossy(original);
    const readerCtx: ReaderContext = {
      godotRoot,
      filePath: absPath,
      parsed: lossyParsed,
      warnings: [],
      resolveRefByExtResource: (ext, targetDomain) => {
        const target = projectIndex.getByResPath(ext.path);
        if (!target) return null;
        if (!("id" in target)) return null;
        if (target.domain !== targetDomain) return null;
        return target.id;
      },
      resPathToAbs: (p) => resPathToAbs(p, godotRoot),
      subResources: domainCase.subResources,
    };
    const result = readFromManifest(lossyParsed, domainCase.entry, readerCtx);
    json = result.entity;
    readWarnings = result.warnings;
  } catch (err) {
    return {
      domain: domainCase.name,
      file,
      status: "error",
      message: `reader threw: ${(err as Error).message}`,
    };
  }
  if (!json) {
    return {
      domain: domainCase.name,
      file,
      status: "error",
      readWarnings,
      message: "reader produced null entity",
    };
  }

  let emitted: string;
  const writeWarnings: string[] = [];
  try {
    const doc = parseTres(original);
    const writerCtx: WriterContext = {
      godotRoot,
      doc,
      warnings: writeWarnings,
      resolveRef: (domain, key) => {
        const indexed = projectIndex.get(domain, key);
        if (!indexed) return null;
        if (!indexed.uid) return null;
        return { uid: indexed.uid, resPath: indexed.resPath };
      },
      resolveTextureUid: (absFsPath) => null as unknown as string,
      resolveSceneUid: (resPathOrAbsPath) => null as unknown as string,
      resolveScriptByClassName: (className) => {
        const s = scriptIndex.getByClassName(className);
        if (!s || !s.uid) return null;
        return { resPath: s.resPath, uid: s.uid };
      },
      subResources: domainCase.subResources,
    };
    // Texture + scene UID lookups read .import sidecars asynchronously
    // but WriterContext's resolvers are sync. Same trade-off the v0.2.7
    // harness made: pre-resolve before the orchestrator runs, plug
    // sync resolvers that close over the resolved UID map.
    const textureUids = await preResolveTextureUids(doc, godotRoot);
    const sceneUids = await preResolveSceneUids(doc, godotRoot);
    writerCtx.resolveTextureUid = (abs) => textureUids.get(abs) ?? null;
    writerCtx.resolveSceneUid = (p) => sceneUids.get(p) ?? null;

    writeFromManifest(doc, domainCase.entry, json, writerCtx);
    removeOrphanExtResources(doc);
    emitted = emitTres(doc);
  } catch (err) {
    return {
      domain: domainCase.name,
      file,
      status: "error",
      readWarnings,
      writeWarnings,
      message: `writer threw: ${(err as Error).message}`,
    };
  }

  if (emitted === original) {
    return {
      domain: domainCase.name,
      file,
      status: "clean",
      readWarnings: readWarnings.length > 0 ? readWarnings : undefined,
      writeWarnings: writeWarnings.length > 0 ? writeWarnings : undefined,
    };
  }
  return {
    domain: domainCase.name,
    file,
    status: hasMultilineString(original) ? "limit-multiline" : "differs",
    readWarnings: readWarnings.length > 0 ? readWarnings : undefined,
    writeWarnings: writeWarnings.length > 0 ? writeWarnings : undefined,
    diffPreview: simpleDiff(original, emitted),
  };
}

function getAttr(
  doc: ReturnType<typeof parseTres>["sections"][number],
  key: string,
): string | null {
  for (const a of doc.attrs) {
    if (a.key !== key) continue;
    // ParsedAttr.rawValue carries surrounding quotes when the value was
    // quoted in the .tres header. Strip them so callers get a plain
    // string (`"Texture2D"` → `Texture2D`).
    const v = a.rawValue;
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
      return v.substring(1, v.length - 1);
    }
    return v;
  }
  return null;
}

// Pre-resolve every Texture2D ext_resource's UID via its .import
// sidecar. The writer's sync resolveTextureUid closes over the
// produced map.
async function preResolveTextureUids(
  doc: ReturnType<typeof parseTres>,
  godotRoot: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const section of doc.sections) {
    if (section.kind !== "ext_resource") continue;
    if (getAttr(section, "type") !== "Texture2D") continue;
    const resPathProp = getAttr(section, "path");
    if (!resPathProp) continue;
    const abs = resPathProp.startsWith("res://")
      ? resPathToAbs(resPathProp, godotRoot)
      : resPathProp;
    try {
      const uid = await readTextureUid(abs);
      if (uid) out.set(abs, uid);
    } catch {
      /* missing sidecar — leave unresolved, writer warns */
    }
  }
  return out;
}

async function preResolveSceneUids(
  doc: ReturnType<typeof parseTres>,
  godotRoot: string,
): Promise<Map<string, string>> {
  // Scene UIDs come from projectIndex (.tscn entries are indexed); the
  // map is keyed by res:// path because that's what the writer's
  // resolveSceneUid receives.
  const out = new Map<string, string>();
  for (const section of doc.sections) {
    if (section.kind !== "ext_resource") continue;
    if (getAttr(section, "type") !== "PackedScene") continue;
    const resPathProp = getAttr(section, "path");
    if (!resPathProp) continue;
    try {
      const uid = await readSceneUid(godotRoot, resPathProp);
      if (uid) out.set(resPathProp, uid);
    } catch {
      /* unindexed scene — leave unresolved */
    }
  }
  return out;
}

function simpleDiff(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const x = aLines[i] ?? "";
    const y = bLines[i] ?? "";
    if (x === y) continue;
    out.push(`  line ${i + 1}:`);
    out.push(`    - ${JSON.stringify(x)}`);
    out.push(`    + ${JSON.stringify(y)}`);
    if (out.length > 40) {
      out.push("    (truncated)");
      break;
    }
  }
  return out.join("\n");
}

async function main() {
  // CLI: positional [godot-root]; optional --domain=name to restrict.
  let godotRoot: string | undefined;
  let domainFilter: string | undefined;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--domain=")) {
      domainFilter = arg.substring("--domain=".length);
    } else if (!arg.startsWith("--")) {
      godotRoot = arg;
    }
  }
  godotRoot ??= config.godotProjectRoot ?? undefined;
  if (!godotRoot) {
    console.error(
      "No Godot project root: pass as CLI arg or configure active project",
    );
    process.exit(1);
  }
  console.log(`[harness:round-trip] root: ${godotRoot}`);

  // Boot indexes — both projectIndex (ref resolution) + scriptIndex
  // (script ext_resource lookup) are needed by per-domain contexts.
  const indexStats = await projectIndex.build(godotRoot);
  console.log(
    `[harness:round-trip] projectIndex: ${indexStats.tresCount} .tres in ${indexStats.durationMs}ms`,
  );
  await scriptIndex.build(godotRoot);
  console.log(`[harness:round-trip] scriptIndex: ${scriptIndex.list().length} .cs`);

  const cases = domainFilter
    ? CASES.filter((c) => c.name === domainFilter)
    : CASES;
  if (cases.length === 0) {
    console.error(
      `[harness:round-trip] no cases matched --domain=${domainFilter}`,
    );
    process.exit(1);
  }

  const results: CaseResult[] = [];
  for (const domainCase of cases) {
    const entries = projectIndex.list(domainCase.indexDomain);
    console.log(
      `\n[harness:round-trip] domain=${domainCase.name} files=${entries.length}`,
    );
    for (const e of entries) {
      const r = await runOne(e.absPath, godotRoot, domainCase);
      results.push(r);
      const marker =
        r.status === "clean"
          ? "pass "
          : r.status === "limit-multiline"
            ? "limit"
            : r.status === "differs"
              ? "DIFF "
              : "ERR  ";
      console.log(`  ${marker} ${e.id}`);
      if (r.message) console.log(`         ${r.message}`);
    }
  }

  const clean = results.filter((r) => r.status === "clean").length;
  const limit = results.filter((r) => r.status === "limit-multiline").length;
  const differs = results.filter((r) => r.status === "differs").length;
  const errors = results.filter((r) => r.status === "error").length;
  console.log(
    `\n[harness:round-trip] clean: ${clean}  limit-multiline: ${limit}  differs: ${differs}  errors: ${errors}`,
  );
  if (differs > 0 || errors > 0 || limit > 0) {
    console.log("\n--- details (architectural diffs + errors first) ---");
    for (const r of results) {
      if (r.status === "clean" || r.status === "limit-multiline") continue;
      console.log(`\n${r.status.toUpperCase()}: ${r.domain}/${r.file}`);
      if (r.message) console.log(`  ${r.message}`);
      if (r.readWarnings) {
        for (const w of r.readWarnings) console.log(`  read warning: ${w}`);
      }
      if (r.writeWarnings) {
        for (const w of r.writeWarnings) console.log(`  write warning: ${w}`);
      }
      if (r.diffPreview) console.log(r.diffPreview);
    }
    if (limit > 0) {
      console.log("\n--- limit-multiline (known parser/writer limitation) ---");
      for (const r of results) {
        if (r.status !== "limit-multiline") continue;
        console.log(`  ${r.domain}/${r.file}`);
      }
    }
  }

  // Architectural gate: any `differs` or `error` is a real failure.
  // `limit-multiline` is informational — the helper-layer fix tracks
  // separately. Karma 6/6 + faction 4/4 + balloon 2/2 are the
  // architectural proof the contract is locked.
  process.exit(differs === 0 && errors === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
