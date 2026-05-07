import type { Doc, Section } from "../types.js";
import {
  addExtResource,
  buildSubResourceSection,
  getAttrValue,
  insertSectionBefore,
  mintSubResourceId,
  reconcileProperty,
  removeSectionById,
  serializeBool,
  serializeEnumInt,
  serializeInt,
  serializeString,
  serializeSubRefArray,
} from "../mutate.js";

// Optional context for slug-to-UID resolution. When set, the mapper will
// add a new [ext_resource] block for any TargetItem/Item slug that the
// .tres doesn't already reference. Without this, such slugs warn and leave
// the property unchanged.
export interface QuestApplyContext {
  resolveItemUid(slug: string): string | null;
  resolveObjectiveScriptUid(): string | null;
  resolveRewardScriptUid(): string | null;
}

// Maps Bleepforge's Quest JSON onto a parsed .tres.
//
// Scope:
//   - Main [resource] scalars: Id, QuestGiverId, Title, Description,
//     ActiveFlag, CompleteFlag, TurnedInFlag.
//   - Objective sub_resource scalars: Id, Description, Type, TargetItem
//     (ext-ref via item-slug lookup), TargetId, EnemyType, RequiredCount,
//     ConsumeOnTurnIn.
//   - Reward sub_resource scalars: Type, Item (ext-ref), Quantity,
//     FlagName, CreditAmount.
//   - Trailing structural: add/remove objectives + rewards (mints sub_ids,
//     reuses existing script ext_resources).
//
// Deferred:
//   - Middle-insert / reorder objectives or rewards
//   - Adding the FIRST objective/reward to a quest with none of that kind
//     (would require adding QuestObjective.cs / QuestReward.cs ext_resource)
//   - Setting TargetItem / Item to a slug whose .tres isn't already
//     ext-referenced in this file (would require adding an ext_resource).
//     Such cases warn and leave the property unchanged.

export const OBJECTIVE_TYPE_TO_INT: Record<string, number> = {
  CollectItem: 0,
  ReachLocation: 1,
  TalkToNpc: 2,
  KillNpc: 3,
  KillEnemyType: 4,
};

export const REWARD_TYPE_TO_INT: Record<string, number> = {
  Item: 0,
  Flag: 1,
  Credits: 2,
};

export const QUEST_FIELD_ORDER: readonly string[] = [
  "script",
  "Id",
  "QuestGiverId",
  "Title",
  "Description",
  "Objectives",
  "Rewards",
  "ActiveFlag",
  "CompleteFlag",
  "TurnedInFlag",
  "metadata/_custom_type_script",
];

export const OBJECTIVE_FIELD_ORDER: readonly string[] = [
  "script",
  "Id",
  "Description",
  "Type",
  "TargetItem",
  "TargetId",
  "EnemyType",
  "RequiredCount",
  "ConsumeOnTurnIn",
  "metadata/_custom_type_script",
];

export const REWARD_FIELD_ORDER: readonly string[] = [
  "script",
  "Type",
  "Item",
  "Quantity",
  "FlagName",
  "CreditAmount",
  "metadata/_custom_type_script",
];

const QUEST_OBJECTIVE_SCRIPT_PATH = "res://shared/components/quest/QuestObjective.cs";
const QUEST_REWARD_SCRIPT_PATH = "res://shared/components/quest/QuestReward.cs";

export interface QuestObjectiveJson {
  Id: string;
  Description: string;
  Type: string;
  TargetItem: string; // item slug
  TargetId: string;
  EnemyType: string;
  RequiredCount: number;
  ConsumeOnTurnIn: boolean;
}

export interface QuestRewardJson {
  Type: string;
  Item: string; // item slug
  Quantity: number;
  FlagName: string;
  CreditAmount: number;
}

export interface QuestJson {
  Id: string;
  QuestGiverId: string;
  Title: string;
  Description: string;
  Objectives: QuestObjectiveJson[];
  Rewards: QuestRewardJson[];
  ActiveFlag: string;
  CompleteFlag: string;
  TurnedInFlag: string;
}

type Action = "updated" | "inserted" | "removed" | "noop";

export interface QuestApplyResult {
  resourceActions: { key: string; action: Action }[];
  objectives: {
    index: number;
    subId: string;
    actions: { key: string; action: Action }[];
  }[];
  objectivesRemoved: { index: number; subId: string }[];
  objectivesAdded: { index: number; subId: string }[];
  rewards: {
    index: number;
    subId: string;
    actions: { key: string; action: Action }[];
  }[];
  rewardsRemoved: { index: number; subId: string }[];
  rewardsAdded: { index: number; subId: string }[];
  warnings: string[];
}

export function applyQuest(
  doc: Doc,
  json: QuestJson,
  ctx?: QuestApplyContext,
): QuestApplyResult {
  const warnings: string[] = [];
  const resourceSection = doc.sections.find((s) => s.kind === "resource");
  if (!resourceSection) {
    warnings.push("no [resource] section");
    return emptyResult(warnings);
  }

  // ---- Structural: objectives ----
  const origObjIds = extractRefArray(resourceSection, "Objectives");
  const finalObjIds = [...origObjIds];
  const objectivesRemoved: QuestApplyResult["objectivesRemoved"] = [];
  const objectivesAdded: QuestApplyResult["objectivesAdded"] = [];

  if (json.Objectives.length < origObjIds.length) {
    for (let i = origObjIds.length - 1; i >= json.Objectives.length; i--) {
      const subId = origObjIds[i]!;
      removeSectionById(doc, "sub_resource", subId);
      finalObjIds.pop();
      objectivesRemoved.unshift({ index: i, subId });
    }
  }

  if (json.Objectives.length > origObjIds.length) {
    const objExt = ensureScriptExtResource(
      doc,
      QUEST_OBJECTIVE_SCRIPT_PATH,
      ctx?.resolveObjectiveScriptUid(),
      "QuestObjective.cs",
      warnings,
    );
    if (!objExt) {
      // already warned
    } else {
      for (let i = origObjIds.length; i < json.Objectives.length; i++) {
        const oj = json.Objectives[i]!;
        const subId = mintSubResourceId(doc);
        const section = buildObjectiveSubResource(doc, oj, objExt, subId, warnings, i, ctx);
        insertSectionBefore(doc, "resource", section);
        finalObjIds.push(subId);
        objectivesAdded.push({ index: i, subId });
      }
    }
  }

  // ---- Structural: rewards ----
  const origRwdIds = extractRefArray(resourceSection, "Rewards");
  const finalRwdIds = [...origRwdIds];
  const rewardsRemoved: QuestApplyResult["rewardsRemoved"] = [];
  const rewardsAdded: QuestApplyResult["rewardsAdded"] = [];

  if (json.Rewards.length < origRwdIds.length) {
    for (let i = origRwdIds.length - 1; i >= json.Rewards.length; i--) {
      const subId = origRwdIds[i]!;
      removeSectionById(doc, "sub_resource", subId);
      finalRwdIds.pop();
      rewardsRemoved.unshift({ index: i, subId });
    }
  }

  if (json.Rewards.length > origRwdIds.length) {
    const rwdExt = ensureScriptExtResource(
      doc,
      QUEST_REWARD_SCRIPT_PATH,
      ctx?.resolveRewardScriptUid(),
      "QuestReward.cs",
      warnings,
    );
    if (!rwdExt) {
      // already warned
    } else {
      for (let i = origRwdIds.length; i < json.Rewards.length; i++) {
        const rj = json.Rewards[i]!;
        const subId = mintSubResourceId(doc);
        const section = buildRewardSubResource(doc, rj, rwdExt, subId, warnings, i, ctx);
        insertSectionBefore(doc, "resource", section);
        finalRwdIds.push(subId);
        rewardsAdded.push({ index: i, subId });
      }
    }
  }

  // ---- Update Objectives / Rewards arrays if structural changes happened ----
  if (finalObjIds.length !== origObjIds.length) {
    reconcileProperty(
      resourceSection,
      "Objectives",
      finalObjIds.length === 0 ? null : serializeSubRefArray(finalObjIds),
      QUEST_FIELD_ORDER,
    );
  }
  if (finalRwdIds.length !== origRwdIds.length) {
    reconcileProperty(
      resourceSection,
      "Rewards",
      finalRwdIds.length === 0 ? null : serializeSubRefArray(finalRwdIds),
      QUEST_FIELD_ORDER,
    );
  }

  // ---- Main [resource] scalars ----
  const resourceActions: QuestApplyResult["resourceActions"] = [
    {
      key: "Id",
      action: reconcileProperty(
        resourceSection,
        "Id",
        serializeString(json.Id),
        QUEST_FIELD_ORDER,
      ),
    },
    {
      key: "QuestGiverId",
      action: reconcileProperty(
        resourceSection,
        "QuestGiverId",
        json.QuestGiverId === "" ? null : serializeString(json.QuestGiverId),
        QUEST_FIELD_ORDER,
      ),
    },
    {
      key: "Title",
      action: reconcileProperty(
        resourceSection,
        "Title",
        json.Title === "" ? null : serializeString(json.Title),
        QUEST_FIELD_ORDER,
      ),
    },
    {
      key: "Description",
      action: reconcileProperty(
        resourceSection,
        "Description",
        json.Description === "" ? null : serializeString(json.Description),
        QUEST_FIELD_ORDER,
      ),
    },
    {
      key: "ActiveFlag",
      action: reconcileProperty(
        resourceSection,
        "ActiveFlag",
        json.ActiveFlag === "" ? null : serializeString(json.ActiveFlag),
        QUEST_FIELD_ORDER,
      ),
    },
    {
      key: "CompleteFlag",
      action: reconcileProperty(
        resourceSection,
        "CompleteFlag",
        json.CompleteFlag === "" ? null : serializeString(json.CompleteFlag),
        QUEST_FIELD_ORDER,
      ),
    },
    {
      key: "TurnedInFlag",
      action: reconcileProperty(
        resourceSection,
        "TurnedInFlag",
        json.TurnedInFlag === "" ? null : serializeString(json.TurnedInFlag),
        QUEST_FIELD_ORDER,
      ),
    },
  ];

  // ---- Per-objective scalars on the surviving range ----
  const objectives: QuestApplyResult["objectives"] = [];
  const commonObjCount = Math.min(json.Objectives.length, finalObjIds.length);
  for (let i = 0; i < commonObjCount; i++) {
    const subId = finalObjIds[i]!;
    const section = findSubResourceById(doc, subId);
    if (!section) {
      warnings.push(`objective sub_resource ${subId} referenced but not declared`);
      continue;
    }
    const oj = json.Objectives[i]!;
    const actions: { key: string; action: Action }[] = reconcileObjectiveScalars(
      doc,
      section,
      oj,
      i,
      warnings,
      ctx,
    );
    objectives.push({ index: i, subId, actions });
  }

  // ---- Per-reward scalars on the surviving range ----
  const rewards: QuestApplyResult["rewards"] = [];
  const commonRwdCount = Math.min(json.Rewards.length, finalRwdIds.length);
  for (let i = 0; i < commonRwdCount; i++) {
    const subId = finalRwdIds[i]!;
    const section = findSubResourceById(doc, subId);
    if (!section) {
      warnings.push(`reward sub_resource ${subId} referenced but not declared`);
      continue;
    }
    const rj = json.Rewards[i]!;
    const actions: { key: string; action: Action }[] = reconcileRewardScalars(
      doc,
      section,
      rj,
      i,
      warnings,
      ctx,
    );
    rewards.push({ index: i, subId, actions });
  }

  return {
    resourceActions,
    objectives,
    objectivesRemoved,
    objectivesAdded,
    rewards,
    rewardsRemoved,
    rewardsAdded,
    warnings,
  };
}

// ---- Per-sub_resource scalar reconcilers ----------------------------------

function reconcileObjectiveScalars(
  doc: Doc,
  section: Section,
  oj: QuestObjectiveJson,
  i: number,
  warnings: string[],
  ctx?: QuestApplyContext,
): { key: string; action: Action }[] {
  const actions: { key: string; action: Action }[] = [
    {
      key: "Id",
      action: reconcileProperty(
        section,
        "Id",
        oj.Id === "" ? null : serializeString(oj.Id),
        OBJECTIVE_FIELD_ORDER,
      ),
    },
    {
      key: "Description",
      action: reconcileProperty(
        section,
        "Description",
        oj.Description === "" ? null : serializeString(oj.Description),
        OBJECTIVE_FIELD_ORDER,
      ),
    },
    {
      key: "Type",
      action: reconcileProperty(
        section,
        "Type",
        oj.Type === "CollectItem"
          ? null
          : serializeEnumInt(oj.Type, OBJECTIVE_TYPE_TO_INT),
        OBJECTIVE_FIELD_ORDER,
      ),
    },
    {
      key: "TargetId",
      action: reconcileProperty(
        section,
        "TargetId",
        oj.TargetId === "" ? null : serializeString(oj.TargetId),
        OBJECTIVE_FIELD_ORDER,
      ),
    },
    {
      key: "EnemyType",
      action: reconcileProperty(
        section,
        "EnemyType",
        oj.EnemyType === "" ? null : serializeString(oj.EnemyType),
        OBJECTIVE_FIELD_ORDER,
      ),
    },
    {
      key: "RequiredCount",
      action: reconcileProperty(
        section,
        "RequiredCount",
        oj.RequiredCount === 1 ? null : serializeInt(oj.RequiredCount),
        OBJECTIVE_FIELD_ORDER,
      ),
    },
    {
      key: "ConsumeOnTurnIn",
      action: reconcileProperty(
        section,
        "ConsumeOnTurnIn",
        oj.ConsumeOnTurnIn === true ? null : serializeBool(oj.ConsumeOnTurnIn),
        OBJECTIVE_FIELD_ORDER,
      ),
    },
  ];
  // TargetItem (ext-ref via slug)
  actions.push({
    key: "TargetItem",
    action: reconcileItemRef(
      doc,
      section,
      "TargetItem",
      oj.TargetItem,
      OBJECTIVE_FIELD_ORDER,
      `objective ${i}`,
      warnings,
      ctx,
    ),
  });
  return actions;
}

function reconcileRewardScalars(
  doc: Doc,
  section: Section,
  rj: QuestRewardJson,
  i: number,
  warnings: string[],
  ctx?: QuestApplyContext,
): { key: string; action: Action }[] {
  const actions: { key: string; action: Action }[] = [
    {
      key: "Type",
      action: reconcileProperty(
        section,
        "Type",
        rj.Type === "Item" ? null : serializeEnumInt(rj.Type, REWARD_TYPE_TO_INT),
        REWARD_FIELD_ORDER,
      ),
    },
    {
      key: "Quantity",
      action: reconcileProperty(
        section,
        "Quantity",
        rj.Quantity === 1 ? null : serializeInt(rj.Quantity),
        REWARD_FIELD_ORDER,
      ),
    },
    {
      key: "FlagName",
      action: reconcileProperty(
        section,
        "FlagName",
        rj.FlagName === "" ? null : serializeString(rj.FlagName),
        REWARD_FIELD_ORDER,
      ),
    },
    {
      key: "CreditAmount",
      action: reconcileProperty(
        section,
        "CreditAmount",
        rj.CreditAmount === 0 ? null : serializeInt(rj.CreditAmount),
        REWARD_FIELD_ORDER,
      ),
    },
  ];
  actions.push({
    key: "Item",
    action: reconcileItemRef(
      doc,
      section,
      "Item",
      rj.Item,
      REWARD_FIELD_ORDER,
      `reward ${i}`,
      warnings,
      ctx,
    ),
  });
  return actions;
}

// ---- Builders for new sub_resources ---------------------------------------

function buildObjectiveSubResource(
  doc: Doc,
  oj: QuestObjectiveJson,
  scriptExt: { id: string; uid: string },
  subId: string,
  warnings: string[],
  i: number,
  ctx: QuestApplyContext | undefined,
): Section {
  const props: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExt.id}")` },
  ];
  if (oj.Id !== "") props.push({ key: "Id", rawValue: serializeString(oj.Id) });
  if (oj.Description !== "")
    props.push({ key: "Description", rawValue: serializeString(oj.Description) });
  if (oj.Type !== "CollectItem")
    props.push({ key: "Type", rawValue: serializeEnumInt(oj.Type, OBJECTIVE_TYPE_TO_INT) });
  if (oj.TargetItem !== "") {
    const extId = ensureItemExtResource(doc, oj.TargetItem, ctx, `appended objective ${i}`, warnings);
    if (extId) props.push({ key: "TargetItem", rawValue: `ExtResource("${extId}")` });
  }
  if (oj.TargetId !== "") props.push({ key: "TargetId", rawValue: serializeString(oj.TargetId) });
  if (oj.EnemyType !== "")
    props.push({ key: "EnemyType", rawValue: serializeString(oj.EnemyType) });
  if (oj.RequiredCount !== 1)
    props.push({ key: "RequiredCount", rawValue: serializeInt(oj.RequiredCount) });
  if (oj.ConsumeOnTurnIn !== true)
    props.push({ key: "ConsumeOnTurnIn", rawValue: serializeBool(oj.ConsumeOnTurnIn) });
  props.push({
    key: "metadata/_custom_type_script",
    rawValue: serializeString(scriptExt.uid),
  });
  return buildSubResourceSection({ type: "Resource", id: subId, properties: props });
}

function buildRewardSubResource(
  doc: Doc,
  rj: QuestRewardJson,
  scriptExt: { id: string; uid: string },
  subId: string,
  warnings: string[],
  i: number,
  ctx: QuestApplyContext | undefined,
): Section {
  const props: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExt.id}")` },
  ];
  if (rj.Type !== "Item")
    props.push({ key: "Type", rawValue: serializeEnumInt(rj.Type, REWARD_TYPE_TO_INT) });
  if (rj.Item !== "") {
    const extId = ensureItemExtResource(doc, rj.Item, ctx, `appended reward ${i}`, warnings);
    if (extId) props.push({ key: "Item", rawValue: `ExtResource("${extId}")` });
  }
  if (rj.Quantity !== 1)
    props.push({ key: "Quantity", rawValue: serializeInt(rj.Quantity) });
  if (rj.FlagName !== "")
    props.push({ key: "FlagName", rawValue: serializeString(rj.FlagName) });
  if (rj.CreditAmount !== 0)
    props.push({ key: "CreditAmount", rawValue: serializeInt(rj.CreditAmount) });
  props.push({
    key: "metadata/_custom_type_script",
    rawValue: serializeString(scriptExt.uid),
  });
  return buildSubResourceSection({ type: "Resource", id: subId, properties: props });
}

// ---- Helpers ---------------------------------------------------------------

function emptyResult(warnings: string[]): QuestApplyResult {
  return {
    resourceActions: [],
    objectives: [],
    objectivesRemoved: [],
    objectivesAdded: [],
    rewards: [],
    rewardsRemoved: [],
    rewardsAdded: [],
    warnings,
  };
}

function reconcileItemRef(
  doc: Doc,
  section: Section,
  key: string,
  slug: string,
  fieldOrder: readonly string[],
  contextLabel: string,
  warnings: string[],
  ctx: QuestApplyContext | undefined,
): Action {
  if (slug === "") {
    return reconcileProperty(section, key, null, fieldOrder);
  }
  const extId = ensureItemExtResource(doc, slug, ctx, contextLabel, warnings);
  if (!extId) return "noop";
  return reconcileProperty(section, key, `ExtResource("${extId}")`, fieldOrder);
}

// Returns the ext_resource id for an item slug, adding a new ext_resource
// block if the .tres doesn't yet reference that item and ctx can resolve
// the item's UID. Returns null if neither is possible (warns).
function ensureItemExtResource(
  doc: Doc,
  slug: string,
  ctx: QuestApplyContext | undefined,
  contextLabel: string,
  warnings: string[],
): string | null {
  const existing = findItemExtResourceBySlug(doc, slug);
  if (existing) return existing;
  if (ctx) {
    const uid = ctx.resolveItemUid(slug);
    if (uid) {
      return addExtResource(doc, {
        type: "Resource",
        uid,
        path: `res://shared/items/data/${slug}.tres`,
      });
    }
  }
  warnings.push(
    `${contextLabel}: item slug "${slug}" has no ext_resource and uid lookup failed — reference left unchanged`,
  );
  return null;
}

function findItemExtResourceBySlug(doc: Doc, slug: string): string | null {
  const wantPath = `res://shared/items/data/${slug}.tres`;
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    const path = getAttrValue(s, "path");
    if (path !== wantPath) continue;
    const id = getAttrValue(s, "id");
    if (id) return id;
  }
  return null;
}

// Returns the {id, uid} of a script ext_resource, adding a new
// `[ext_resource type="Script"]` block if needed. Returns null and warns
// if the script can't be resolved.
function ensureScriptExtResource(
  doc: Doc,
  resPath: string,
  uidFromCtx: string | null | undefined,
  scriptLabel: string,
  warnings: string[],
): { id: string; uid: string } | null {
  const existing = findScriptExtResource(doc, resPath);
  if (existing) return existing;
  if (!uidFromCtx) {
    warnings.push(
      `${scriptLabel} ext_resource not present and uid lookup failed — operation skipped`,
    );
    return null;
  }
  const id = addExtResource(doc, { type: "Script", uid: uidFromCtx, path: resPath });
  return { id, uid: uidFromCtx };
}

function findScriptExtResource(
  doc: Doc,
  resPath: string,
): { id: string; uid: string } | null {
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    const type = getAttrValue(s, "type");
    const path = getAttrValue(s, "path");
    if (type !== "Script" || path !== resPath) continue;
    const id = getAttrValue(s, "id");
    const uid = getAttrValue(s, "uid");
    if (id && uid) return { id, uid };
  }
  return null;
}

function findSubResourceById(doc: Doc, id: string): Section | undefined {
  return doc.sections.find(
    (s) => s.kind === "sub_resource" && getAttrValue(s, "id") === id,
  );
}

function extractRefArray(section: Section, key: string): string[] {
  const entry = section.body.find((e) => e.kind === "property" && e.key === key);
  if (!entry || entry.kind !== "property") return [];
  const ids: string[] = [];
  const re = /SubResource\("([^"]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry.rawAfterEquals)) !== null) {
    ids.push(m[1]!);
  }
  return ids;
}
