import type { Doc, Section } from "../types.js";
import {
  addExtResource,
  buildSubResourceSection,
  getAttrValue,
  reconcileProperty,
  reconcileSubResourceArray,
  serializeBool,
  serializeEnumInt,
  serializeInt,
  serializeString,
  type ReconcileAction,
  type SubArrayReconcileResult,
} from "../mutate.js";

// Quest mapper. Objectives + Rewards are id-aware via `_subId` — reorder,
// add, update, remove all work via stable identity matching.

export interface QuestApplyContext {
  resolveItemUid(slug: string): string | null;
  resolveObjectiveScriptUid(): string | null;
  resolveRewardScriptUid(): string | null;
}

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
  _subId?: string;
  Id: string;
  Description: string;
  Type: string;
  TargetItem: string;
  TargetId: string;
  EnemyType: string;
  RequiredCount: number;
  ConsumeOnTurnIn: boolean;
}

export interface QuestRewardJson {
  _subId?: string;
  Type: string;
  Item: string;
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

export interface QuestApplyResult {
  resourceActions: { key: string; action: ReconcileAction }[];
  objectivesUpdated: SubArrayReconcileResult["updated"];
  objectivesAdded: SubArrayReconcileResult["added"];
  objectivesRemoved: SubArrayReconcileResult["removed"];
  rewardsUpdated: SubArrayReconcileResult["updated"];
  rewardsAdded: SubArrayReconcileResult["added"];
  rewardsRemoved: SubArrayReconcileResult["removed"];
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

  const objExt = ensureScriptExtResource(
    doc,
    QUEST_OBJECTIVE_SCRIPT_PATH,
    ctx?.resolveObjectiveScriptUid() ?? null,
    "QuestObjective.cs",
    warnings,
  );
  const rwdExt = ensureScriptExtResource(
    doc,
    QUEST_REWARD_SCRIPT_PATH,
    ctx?.resolveRewardScriptUid() ?? null,
    "QuestReward.cs",
    warnings,
  );

  const objectivesResult = reconcileSubResourceArray(
    doc,
    resourceSection,
    "Objectives",
    QUEST_FIELD_ORDER,
    json.Objectives,
    {
      reconcileExisting: (section, oj) => reconcileObjectiveScalars(doc, section, oj, ctx, warnings),
      buildNew: (oj, subId) => {
        if (!objExt) return null;
        return buildObjectiveSubResource(doc, oj, objExt, subId, warnings, ctx);
      },
      insertBefore: "resource",
    },
  );

  const rewardsResult = reconcileSubResourceArray(
    doc,
    resourceSection,
    "Rewards",
    QUEST_FIELD_ORDER,
    json.Rewards,
    {
      reconcileExisting: (section, rj) => reconcileRewardScalars(doc, section, rj, ctx, warnings),
      buildNew: (rj, subId) => {
        if (!rwdExt) return null;
        return buildRewardSubResource(doc, rj, rwdExt, subId, warnings, ctx);
      },
      insertBefore: "resource",
    },
  );

  const resourceActions: QuestApplyResult["resourceActions"] = [
    { key: "Id", action: reconcileProperty(resourceSection, "Id", serializeString(json.Id), QUEST_FIELD_ORDER) },
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

  return {
    resourceActions,
    objectivesUpdated: objectivesResult.updated,
    objectivesAdded: objectivesResult.added,
    objectivesRemoved: objectivesResult.removed,
    rewardsUpdated: rewardsResult.updated,
    rewardsAdded: rewardsResult.added,
    rewardsRemoved: rewardsResult.removed,
    warnings,
  };
}

// ---- Per-sub_resource scalar reconcilers ----------------------------------

function reconcileObjectiveScalars(
  doc: Doc,
  section: Section,
  oj: QuestObjectiveJson,
  ctx: QuestApplyContext | undefined,
  warnings: string[],
): { key: string; action: ReconcileAction }[] {
  const actions: { key: string; action: ReconcileAction }[] = [
    {
      key: "Id",
      action: reconcileProperty(section, "Id", oj.Id === "" ? null : serializeString(oj.Id), OBJECTIVE_FIELD_ORDER),
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
        oj.Type === "CollectItem" ? null : serializeEnumInt(oj.Type, OBJECTIVE_TYPE_TO_INT),
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
    {
      key: "TargetItem",
      action: reconcileItemRef(doc, section, "TargetItem", oj.TargetItem, OBJECTIVE_FIELD_ORDER, "objective", warnings, ctx),
    },
  ];
  return actions;
}

function reconcileRewardScalars(
  doc: Doc,
  section: Section,
  rj: QuestRewardJson,
  ctx: QuestApplyContext | undefined,
  warnings: string[],
): { key: string; action: ReconcileAction }[] {
  return [
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
    {
      key: "Item",
      action: reconcileItemRef(doc, section, "Item", rj.Item, REWARD_FIELD_ORDER, "reward", warnings, ctx),
    },
  ];
}

// ---- Builders for new sub_resources ---------------------------------------

function buildObjectiveSubResource(
  doc: Doc,
  oj: QuestObjectiveJson,
  scriptExt: { id: string; uid: string },
  subId: string,
  warnings: string[],
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
    const extId = ensureItemExtResource(doc, oj.TargetItem, ctx, "appended objective", warnings);
    if (extId) props.push({ key: "TargetItem", rawValue: `ExtResource("${extId}")` });
  }
  if (oj.TargetId !== "") props.push({ key: "TargetId", rawValue: serializeString(oj.TargetId) });
  if (oj.EnemyType !== "")
    props.push({ key: "EnemyType", rawValue: serializeString(oj.EnemyType) });
  if (oj.RequiredCount !== 1)
    props.push({ key: "RequiredCount", rawValue: serializeInt(oj.RequiredCount) });
  if (oj.ConsumeOnTurnIn !== true)
    props.push({ key: "ConsumeOnTurnIn", rawValue: serializeBool(oj.ConsumeOnTurnIn) });
  props.push({ key: "metadata/_custom_type_script", rawValue: serializeString(scriptExt.uid) });
  return buildSubResourceSection({ type: "Resource", id: subId, properties: props });
}

function buildRewardSubResource(
  doc: Doc,
  rj: QuestRewardJson,
  scriptExt: { id: string; uid: string },
  subId: string,
  warnings: string[],
  ctx: QuestApplyContext | undefined,
): Section {
  const props: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExt.id}")` },
  ];
  if (rj.Type !== "Item")
    props.push({ key: "Type", rawValue: serializeEnumInt(rj.Type, REWARD_TYPE_TO_INT) });
  if (rj.Item !== "") {
    const extId = ensureItemExtResource(doc, rj.Item, ctx, "appended reward", warnings);
    if (extId) props.push({ key: "Item", rawValue: `ExtResource("${extId}")` });
  }
  if (rj.Quantity !== 1) props.push({ key: "Quantity", rawValue: serializeInt(rj.Quantity) });
  if (rj.FlagName !== "")
    props.push({ key: "FlagName", rawValue: serializeString(rj.FlagName) });
  if (rj.CreditAmount !== 0)
    props.push({ key: "CreditAmount", rawValue: serializeInt(rj.CreditAmount) });
  props.push({ key: "metadata/_custom_type_script", rawValue: serializeString(scriptExt.uid) });
  return buildSubResourceSection({ type: "Resource", id: subId, properties: props });
}

// ---- Ext-resource helpers --------------------------------------------------

function reconcileItemRef(
  doc: Doc,
  section: Section,
  key: string,
  slug: string,
  fieldOrder: readonly string[],
  contextLabel: string,
  warnings: string[],
  ctx: QuestApplyContext | undefined,
): ReconcileAction {
  if (slug === "") {
    return reconcileProperty(section, key, null, fieldOrder);
  }
  const extId = ensureItemExtResource(doc, slug, ctx, contextLabel, warnings);
  if (!extId) return "noop";
  return reconcileProperty(section, key, `ExtResource("${extId}")`, fieldOrder);
}

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

function ensureScriptExtResource(
  doc: Doc,
  resPath: string,
  uidFromCtx: string | null,
  scriptLabel: string,
  warnings: string[],
): { id: string; uid: string } | null {
  const existing = findScriptExtResource(doc, resPath);
  if (existing) return existing;
  if (!uidFromCtx) return null; // not an error if we don't need it
  const id = addExtResource(doc, { type: "Script", uid: uidFromCtx, path: resPath });
  return { id, uid: uidFromCtx };
}

function findItemExtResourceBySlug(doc: Doc, slug: string): string | null {
  const wantPath = `res://shared/items/data/${slug}.tres`;
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "path") !== wantPath) continue;
    const id = getAttrValue(s, "id");
    if (id) return id;
  }
  return null;
}

function findScriptExtResource(
  doc: Doc,
  resPath: string,
): { id: string; uid: string } | null {
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== "Script") continue;
    if (getAttrValue(s, "path") !== resPath) continue;
    const id = getAttrValue(s, "id");
    const uid = getAttrValue(s, "uid");
    if (id && uid) return { id, uid };
  }
  return null;
}

function emptyResult(warnings: string[]): QuestApplyResult {
  return {
    resourceActions: [],
    objectivesUpdated: [],
    objectivesAdded: [],
    objectivesRemoved: [],
    rewardsUpdated: [],
    rewardsAdded: [],
    rewardsRemoved: [],
    warnings,
  };
}
