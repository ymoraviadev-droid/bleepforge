import type { Section } from "../types.js";
import { reconcileProperty, serializeString } from "../mutate.js";

// Maps Bleepforge's Npc JSON onto a parsed `[resource]` section. v1 is
// scalar-only (mirrors Item's pattern): we round-trip the 7 string fields
// users actually edit on the form. Reference fields (Portrait, DefaultDialog,
// OffendedDialog, CasualRemark) and array fields (Quests, LootTable) are left
// untouched in the .tres — they're round-trip preserved but not authored in v1
// (see the NpcData section in CLAUDE.md for the rationale).
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

interface FieldRule {
  key: keyof NpcJson;
  rawOrNull: (json: NpcJson) => string | null;
}

// All Godot string defaults are "" — emit null (omit line) when the JSON
// field is empty so we mirror Godot's serialization behavior.
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
  actions: { key: string; action: "updated" | "inserted" | "removed" | "noop" }[];
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
