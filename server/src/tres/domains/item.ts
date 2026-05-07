import type { Doc, Section } from "../types.js";
import {
  reconcileProperty,
  serializeBool,
  serializeEnumInt,
  serializeInt,
  serializeString,
} from "../mutate.js";
import {
  reconcileTextureField,
  type TextureRefContext,
} from "../textureRef.js";

// Maps Bleepforge's Item JSON onto a parsed `[resource]` section. Reconciles
// every scalar field — updates, inserts, or removes the property line based
// on whether the JSON value matches the C# default. Skips Slug (identity).
//
// Icon IS reconciled, with one important caveat: most items in this corpus
// use AtlasTexture sub_resources (region of a sprite sheet) for their Icon
// rather than a Texture2D ExtResource. The importer drops AtlasTextures and
// gives JSON empty Icon. If we naively turned "empty JSON → remove the line"
// we'd destroy the user's atlas. reconcileTextureField in textureRef.ts
// inspects the current .tres value and preserves SubResource lines when JSON
// is empty.

export const ITEM_CATEGORY_TO_INT: Record<string, number> = {
  Misc: 0,
  Weapon: 1,
  QuestItem: 2,
  Upgrade: 3,
  Consumable: 4,
};

// Property order Godot writes in (matches C# class declaration order).
// Used to decide where to insert a new line; `script` and the metadata
// trailer bracket the user-authored fields.
export const ITEM_FIELD_ORDER: readonly string[] = [
  "script",
  "Slug",
  "DisplayName",
  "Description",
  "Icon",
  "IsStackable",
  "MaxStack",
  "Price",
  "Category",
  // QuestItemData additions (only present when Category=QuestItem):
  "QuestId",
  "CanDrop",
  // Always last:
  "metadata/_custom_type_script",
];

export interface ItemJson {
  Slug: string;
  DisplayName: string;
  Description: string;
  Icon: string;
  IsStackable: boolean;
  MaxStack: number;
  Price: number;
  Category: string;
  QuestId?: string;
  CanDrop?: boolean;
}

// Reconciles a single field: returns the raw text Godot would write, or
// null if the value matches the C# default (Godot omits default values
// when saving, so we should too).
type FieldRule = {
  key: string;
  rawOrNull: (json: ItemJson) => string | null;
};

const FIELD_RULES: FieldRule[] = [
  { key: "DisplayName", rawOrNull: (j) => (j.DisplayName === "" ? null : serializeString(j.DisplayName)) },
  { key: "Description", rawOrNull: (j) => (j.Description === "" ? null : serializeString(j.Description)) },
  // Icon — reconciled separately via reconcileTextureField (needs doc + ctx).
  { key: "IsStackable", rawOrNull: (j) => (j.IsStackable === true ? null : serializeBool(j.IsStackable)) },
  { key: "MaxStack", rawOrNull: (j) => (j.MaxStack === 99 ? null : serializeInt(j.MaxStack)) },
  { key: "Price", rawOrNull: (j) => (j.Price === 0 ? null : serializeInt(j.Price)) },
  { key: "Category", rawOrNull: (j) => (j.Category === "Misc" ? null : serializeEnumInt(j.Category, ITEM_CATEGORY_TO_INT)) },
];

const QUEST_ITEM_RULES: FieldRule[] = [
  // QuestItemData.QuestId is a free-form string. Bleepforge's Item JSON has
  // it on every item, but it's only meaningful (and only present in .tres)
  // when Category=QuestItem. We only reconcile it if the Category indicates
  // a QuestItemData; otherwise we leave the file alone.
  { key: "QuestId", rawOrNull: (j) => (j.QuestId === undefined || j.QuestId === "" ? null : serializeString(j.QuestId)) },
  // CanDrop default is false (per QuestItemData.cs constructor).
  { key: "CanDrop", rawOrNull: (j) => (j.CanDrop === undefined || j.CanDrop === false ? null : serializeBool(j.CanDrop)) },
];

export interface ApplyResult {
  actions: {
    key: string;
    action: "updated" | "inserted" | "removed" | "noop" | "preserved";
  }[];
  warnings: string[];
}

export function applyItemScalars(
  doc: Doc,
  section: Section,
  json: ItemJson,
  textureCtx: TextureRefContext,
): ApplyResult {
  const actions: ApplyResult["actions"] = [];
  const warnings: string[] = [];

  for (const rule of FIELD_RULES) {
    const raw = rule.rawOrNull(json);
    const action = reconcileProperty(section, rule.key, raw, ITEM_FIELD_ORDER);
    actions.push({ key: rule.key, action });
  }

  // Icon — Texture2D ExtResource (or AtlasTexture SubResource we shouldn't
  // touch). reconcileTextureField handles both cases.
  const iconResult = reconcileTextureField(
    doc,
    section,
    "Icon",
    ITEM_FIELD_ORDER,
    json.Icon,
    textureCtx,
    `item "${json.Slug}"`,
  );
  actions.push({ key: "Icon", action: iconResult.action });
  warnings.push(...iconResult.warnings);

  // QuestItemData fields only when this is actually a quest item.
  if (json.Category === "QuestItem") {
    for (const rule of QUEST_ITEM_RULES) {
      const raw = rule.rawOrNull(json);
      const action = reconcileProperty(section, rule.key, raw, ITEM_FIELD_ORDER);
      actions.push({ key: rule.key, action });
    }
  }

  return { actions, warnings };
}
