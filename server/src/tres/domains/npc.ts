import type { Doc, Section } from "../types.js";
import {
  addExtResource,
  buildSubResourceSection,
  extractRefArray,
  findSubResourceById,
  getAttrValue,
  insertSectionBefore,
  reconcileProperty,
  reconcileSubResourceArray,
  removeSectionById,
  serializeInt,
  serializeString,
  type ReconcileAction,
} from "../mutate.js";

// Maps Bleepforge's Npc JSON onto a parsed `[resource]` section.
//
// Scalar-only for the seven round-tripped string fields users edit on the
// Identity / Karma / Misc sections of the NPC form. Reference fields
// (Portrait, DefaultDialog, OffendedDialog, CasualRemark) and the Quests
// array are still NOT reconciled — Bleepforge round-trips them but doesn't
// author them yet (see CLAUDE.md for the Phase 3 plan).
//
// LootTable IS reconciled now — see applyNpcLootTable below. It handles all
// four cases (none → none, none → some, some → none, some → some) so the
// LootTable editor on the NPC page can save without manual Godot fix-up.
//
// NpcId is the identity discriminator and isn't reconciled either — changing
// it would mean a different file.

export const NPC_FIELD_ORDER: readonly string[] = [
  "script",
  "DisplayName",
  "NpcId",
  "MemoryEntryId",
  "Portrait",
  "DefaultDialog",
  "OffendedDialog",
  "OffendedFlag",
  "Quests",
  "DeathImpactId",
  "DeathImpactIdContextual",
  "ContextualFlag",
  "LootTable",
  "CasualRemark",
  "DidSpeakFlag",
  "metadata/_custom_type_script",
];

const LOOT_TABLE_FIELD_ORDER: readonly string[] = [
  "script",
  "Entries",
  "metadata/_custom_type_script",
];

const LOOT_ENTRY_FIELD_ORDER: readonly string[] = [
  "script",
  "PickupScene",
  "Chance",
  "MinAmount",
  "MaxAmount",
  "metadata/_custom_type_script",
];

const LOOT_TABLE_SCRIPT_PATH = "res://shared/components/loot/LootTable.cs";
const LOOT_ENTRY_SCRIPT_PATH = "res://shared/components/loot/LootEntry.cs";

export interface NpcJson {
  NpcId: string;
  DisplayName: string;
  MemoryEntryId: string;
  OffendedFlag: string;
  DeathImpactId: string;
  DeathImpactIdContextual: string;
  ContextualFlag: string;
  DidSpeakFlag: string;
}

export interface LootEntryJson {
  _subId?: string;
  PickupScene: string; // res:// path to .tscn
  Chance: number;
  MinAmount: number;
  MaxAmount: number;
}

export interface LootTableJson {
  _subId?: string;
  Entries: LootEntryJson[];
}

// Resolvers the NPC writer needs from the host (writer.ts) — pre-populated
// so the per-section mappers can stay synchronous against the doc.
export interface NpcLootApplyContext {
  /** UID of LootTable.cs script ext_resource. Null when the script can't be
   *  found in any project file (e.g. fresh project) — caller warns. */
  lootTableScriptUid: string | null;
  /** UID of LootEntry.cs script ext_resource. Same nullability story. */
  lootEntryScriptUid: string | null;
  /** UID of a PackedScene at the given res:// path. Null = unknown / asset
   *  missing. Pre-resolved per scene so the apply pass doesn't do file I/O. */
  resolveSceneUid(scenePath: string): string | null;
}

interface FieldRule {
  key: keyof NpcJson;
  rawOrNull: (json: NpcJson) => string | null;
}

const FIELD_RULES: FieldRule[] = [
  { key: "DisplayName", rawOrNull: (j) => emptyOrString(j.DisplayName) },
  { key: "MemoryEntryId", rawOrNull: (j) => emptyOrString(j.MemoryEntryId) },
  { key: "OffendedFlag", rawOrNull: (j) => emptyOrString(j.OffendedFlag) },
  { key: "DeathImpactId", rawOrNull: (j) => emptyOrString(j.DeathImpactId) },
  {
    key: "DeathImpactIdContextual",
    rawOrNull: (j) => emptyOrString(j.DeathImpactIdContextual),
  },
  { key: "ContextualFlag", rawOrNull: (j) => emptyOrString(j.ContextualFlag) },
  { key: "DidSpeakFlag", rawOrNull: (j) => emptyOrString(j.DidSpeakFlag) },
];

function emptyOrString(s: string): string | null {
  return s === "" ? null : serializeString(s);
}

export interface ApplyResult {
  actions: { key: string; action: ReconcileAction }[];
  warnings: string[];
}

export function applyNpcScalars(section: Section, json: NpcJson): ApplyResult {
  const actions: ApplyResult["actions"] = [];
  for (const rule of FIELD_RULES) {
    const raw = rule.rawOrNull(json);
    const action = reconcileProperty(section, rule.key, raw, NPC_FIELD_ORDER);
    actions.push({ key: rule.key, action });
  }
  return { actions, warnings: [] };
}

// ---- LootTable reconciler --------------------------------------------------

// Read the SubResource id from `LootTable = SubResource("...")` on the
// [resource] section, or null if the property isn't present.
function readLootTableSubId(resourceSection: Section): string | null {
  const entry = resourceSection.body.find(
    (e) => e.kind === "property" && e.key === "LootTable",
  );
  if (!entry || entry.kind !== "property") return null;
  const m = entry.rawAfterEquals.match(/SubResource\("([^"]+)"\)/);
  return m ? m[1]! : null;
}

// Find or add a PackedScene ext_resource for `scenePath`. Reuses an existing
// ext_resource when the path matches (avoids duplicate refs).
function ensurePackedSceneExt(
  doc: Doc,
  scenePath: string,
  ctx: NpcLootApplyContext,
): { id: string; warnings: string[] } {
  const warnings: string[] = [];
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== "PackedScene") continue;
    if (getAttrValue(s, "path") !== scenePath) continue;
    const id = getAttrValue(s, "id");
    if (id) return { id, warnings };
  }
  const uid = ctx.resolveSceneUid(scenePath);
  if (!uid) {
    warnings.push(`no UID for PackedScene "${scenePath}" — entry kept as-is`);
    return { id: "", warnings };
  }
  const id = addExtResource(doc, {
    type: "PackedScene",
    uid,
    path: scenePath,
  });
  return { id, warnings };
}

function ensureScriptExt(
  doc: Doc,
  scriptPath: string,
  scriptUid: string | null,
): { id: string | null; warnings: string[] } {
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== "Script") continue;
    if (getAttrValue(s, "path") !== scriptPath) continue;
    const id = getAttrValue(s, "id");
    if (id) return { id, warnings: [] };
  }
  if (!scriptUid) {
    return {
      id: null,
      warnings: [
        `script "${scriptPath}" not present in this .tres and no UID known — cannot add`,
      ],
    };
  }
  const id = addExtResource(doc, {
    type: "Script",
    uid: scriptUid,
    path: scriptPath,
  });
  return { id, warnings: [] };
}

function reconcileLootEntryScalars(
  section: Section,
  entry: LootEntryJson,
  pickupSceneExtId: string,
): { key: string; action: ReconcileAction }[] {
  const out: { key: string; action: ReconcileAction }[] = [];
  if (pickupSceneExtId) {
    out.push({
      key: "PickupScene",
      action: reconcileProperty(
        section,
        "PickupScene",
        `ExtResource("${pickupSceneExtId}")`,
        LOOT_ENTRY_FIELD_ORDER,
      ),
    });
  }
  // Defaults from LootEntry.cs: Chance=1.0, MinAmount=1, MaxAmount=1.
  out.push({
    key: "Chance",
    action: reconcileProperty(
      section,
      "Chance",
      entry.Chance === 1 || entry.Chance === 1.0
        ? null
        : String(entry.Chance),
      LOOT_ENTRY_FIELD_ORDER,
    ),
  });
  out.push({
    key: "MinAmount",
    action: reconcileProperty(
      section,
      "MinAmount",
      entry.MinAmount === 1 ? null : serializeInt(entry.MinAmount),
      LOOT_ENTRY_FIELD_ORDER,
    ),
  });
  out.push({
    key: "MaxAmount",
    action: reconcileProperty(
      section,
      "MaxAmount",
      entry.MaxAmount === 1 ? null : serializeInt(entry.MaxAmount),
      LOOT_ENTRY_FIELD_ORDER,
    ),
  });
  return out;
}

function buildLootEntrySection(
  entry: LootEntryJson,
  scriptExtId: string,
  scriptUid: string,
  pickupSceneExtId: string,
  subId: string,
): Section {
  const props: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExtId}")` },
  ];
  if (pickupSceneExtId) {
    props.push({
      key: "PickupScene",
      rawValue: `ExtResource("${pickupSceneExtId}")`,
    });
  }
  if (entry.Chance !== 1) {
    props.push({ key: "Chance", rawValue: String(entry.Chance) });
  }
  if (entry.MinAmount !== 1) {
    props.push({ key: "MinAmount", rawValue: serializeInt(entry.MinAmount) });
  }
  if (entry.MaxAmount !== 1) {
    props.push({ key: "MaxAmount", rawValue: serializeInt(entry.MaxAmount) });
  }
  props.push({
    key: "metadata/_custom_type_script",
    rawValue: serializeString(scriptUid),
  });
  return buildSubResourceSection({ type: "Resource", id: subId, properties: props });
}

function buildLootTableSection(
  scriptExtId: string,
  scriptUid: string,
  subId: string,
): Section {
  const props: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExtId}")` },
    // Entries stays empty initially — the reconcile pass below populates it.
    { key: "Entries", rawValue: "[]" },
    { key: "metadata/_custom_type_script", rawValue: serializeString(scriptUid) },
  ];
  return buildSubResourceSection({ type: "Resource", id: subId, properties: props });
}

export interface LootApplyResult {
  warnings: string[];
}

export function applyNpcLootTable(
  doc: Doc,
  resourceSection: Section,
  json: LootTableJson | null,
  ctx: NpcLootApplyContext,
): LootApplyResult {
  const warnings: string[] = [];
  const existingId = readLootTableSubId(resourceSection);

  // Case A: JSON has no LootTable.
  if (!json) {
    if (!existingId) return { warnings }; // no-op
    // Remove all entries the LootTable referenced, then the LootTable itself.
    const lootSection = findSubResourceById(doc, existingId);
    if (lootSection) {
      const entryIds = extractRefArray(lootSection, "Entries");
      for (const eid of entryIds) {
        removeSectionById(doc, "sub_resource", eid);
      }
      removeSectionById(doc, "sub_resource", existingId);
    }
    reconcileProperty(resourceSection, "LootTable", null, NPC_FIELD_ORDER);
    return { warnings };
  }

  // Case B: JSON has a LootTable. Make sure the .tres has one too, then
  // reconcile its Entries.
  let lootSection: Section | undefined = existingId
    ? findSubResourceById(doc, existingId)
    : undefined;

  // Resolve scripts up front; both the create and reconcile paths need them.
  const tableScript = ensureScriptExt(
    doc,
    LOOT_TABLE_SCRIPT_PATH,
    ctx.lootTableScriptUid,
  );
  warnings.push(...tableScript.warnings);
  const entryScript = ensureScriptExt(
    doc,
    LOOT_ENTRY_SCRIPT_PATH,
    ctx.lootEntryScriptUid,
  );
  warnings.push(...entryScript.warnings);

  if (!lootSection) {
    // Need to create the LootTable sub_resource.
    if (!tableScript.id || !ctx.lootTableScriptUid) {
      warnings.push(
        "cannot add LootTable: LootTable.cs script not present in this .tres and no UID known",
      );
      return { warnings };
    }
    const newId = mintSubId(doc);
    lootSection = buildLootTableSection(
      tableScript.id,
      ctx.lootTableScriptUid,
      newId,
    );
    insertSectionBefore(doc, "resource", lootSection);
    reconcileProperty(
      resourceSection,
      "LootTable",
      `SubResource("${newId}")`,
      NPC_FIELD_ORDER,
    );
  }

  // Now reconcile the Entries array on the (possibly fresh) LootTable section.
  if (!entryScript.id) {
    if (json.Entries.length > 0) {
      warnings.push(
        "cannot add LootEntry: LootEntry.cs script not present in this .tres and no UID known",
      );
    }
    return { warnings };
  }

  // Pre-ensure PackedScene ext-resources for every entry's PickupScene so
  // each entry knows its scene's ext-resource id when reconciling/building.
  const sceneExtByPath = new Map<string, string>();
  for (const e of json.Entries) {
    if (!e.PickupScene) continue;
    if (sceneExtByPath.has(e.PickupScene)) continue;
    const r = ensurePackedSceneExt(doc, e.PickupScene, ctx);
    warnings.push(...r.warnings);
    if (r.id) sceneExtByPath.set(e.PickupScene, r.id);
  }

  const entryScriptUid = ctx.lootEntryScriptUid!;
  const entryScriptId = entryScript.id;

  reconcileSubResourceArray<LootEntryJson>(
    doc,
    lootSection,
    "Entries",
    LOOT_TABLE_FIELD_ORDER,
    json.Entries,
    {
      reconcileExisting: (section, entry) => {
        const sceneExt = entry.PickupScene
          ? sceneExtByPath.get(entry.PickupScene) ?? ""
          : "";
        return reconcileLootEntryScalars(section, entry, sceneExt);
      },
      buildNew: (entry, subId) => {
        const sceneExt = entry.PickupScene
          ? sceneExtByPath.get(entry.PickupScene) ?? ""
          : "";
        return buildLootEntrySection(
          entry,
          entryScriptId,
          entryScriptUid,
          sceneExt,
          subId,
        );
      },
      // Use the LootTable section as the insert anchor — new LootEntry
      // sub_resources go right before it, keeping the file's grouping
      // (entries first, then their host LootTable, then [resource]).
      insertBefore: lootSection,
      typedArrayExtId: entryScriptId,
    },
  );

  return { warnings };
}

// Mints a sub_resource id matching Godot's format `Resource_<5alnum>` and
// guarantees it doesn't collide with anything already in the doc.
function mintSubId(doc: Doc): string {
  const taken = new Set<string>();
  for (const s of doc.sections) {
    if (s.kind !== "sub_resource") continue;
    const id = getAttrValue(s, "id");
    if (id) taken.add(id);
  }
  for (let attempt = 0; attempt < 1000; attempt++) {
    const id = `Resource_${randomAlnum(5)}`;
    if (!taken.has(id)) return id;
  }
  throw new Error("mintSubId: exhausted attempts");
}

function randomAlnum(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
