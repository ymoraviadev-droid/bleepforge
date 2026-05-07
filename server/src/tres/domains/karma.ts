import type { Doc, Section } from "../types.js";
import {
  reconcileProperty,
  serializeEnumInt,
  serializeInt,
  serializeString,
} from "../mutate.js";

// Maps Bleepforge's KarmaImpact JSON onto a parsed .tres. Reconciles:
//   - main `[resource]` block: Id (string), Description (string)
//   - each `[sub_resource]` block referenced by the `Deltas` array:
//     Faction (enum-as-int) and Amount (int)
//
// Per-delta matching is by **position** in the Deltas array. Adding,
// removing, or reordering deltas is structural and deferred.

export const FACTION_TO_INT: Record<string, number> = {
  Scavengers: 0,
  FreeRobots: 1,
  RFF: 2,
  Grove: 3,
};

export const KARMA_FIELD_ORDER: readonly string[] = [
  "script",
  "Id",
  "Description",
  "Deltas",
  "metadata/_custom_type_script",
];

export const KARMA_DELTA_FIELD_ORDER: readonly string[] = [
  "script",
  "Faction",
  "Amount",
  "metadata/_custom_type_script",
];

export interface KarmaDeltaJson {
  Faction: string;
  Amount: number;
}

export interface KarmaJson {
  Id: string;
  Description: string;
  Deltas: KarmaDeltaJson[];
}

type Action = "updated" | "inserted" | "removed" | "noop";

export interface KarmaApplyResult {
  resourceActions: { key: string; action: Action }[];
  deltas: { index: number; subId: string; actions: { key: string; action: Action }[] }[];
  warnings: string[];
}

export function applyKarmaScalars(doc: Doc, json: KarmaJson): KarmaApplyResult {
  const warnings: string[] = [];
  const resourceSection = doc.sections.find((s) => s.kind === "resource");
  if (!resourceSection) {
    warnings.push("no [resource] section");
    return { resourceActions: [], deltas: [], warnings };
  }

  const resourceActions: KarmaApplyResult["resourceActions"] = [
    {
      key: "Id",
      action: reconcileProperty(
        resourceSection,
        "Id",
        serializeString(json.Id),
        KARMA_FIELD_ORDER,
      ),
    },
    {
      key: "Description",
      action: reconcileProperty(
        resourceSection,
        "Description",
        json.Description === "" ? null : serializeString(json.Description),
        KARMA_FIELD_ORDER,
      ),
    },
  ];

  const deltaIds = extractDeltaSubIds(resourceSection);
  const deltas: KarmaApplyResult["deltas"] = [];
  for (let i = 0; i < json.Deltas.length; i++) {
    const subId = deltaIds[i];
    if (!subId) {
      warnings.push(
        `json delta ${i} has no matching sub_resource (.tres has ${deltaIds.length} deltas)`,
      );
      continue;
    }
    const subSection = doc.sections.find(
      (s) => s.kind === "sub_resource" && getAttrValue(s, "id") === subId,
    );
    if (!subSection) {
      warnings.push(`sub_resource ${subId} referenced but not declared`);
      continue;
    }
    const dj = json.Deltas[i]!;
    const actions: { key: string; action: Action }[] = [
      {
        key: "Faction",
        action: reconcileProperty(
          subSection,
          "Faction",
          dj.Faction === "Scavengers" ? null : serializeEnumInt(dj.Faction, FACTION_TO_INT),
          KARMA_DELTA_FIELD_ORDER,
        ),
      },
      {
        key: "Amount",
        action: reconcileProperty(
          subSection,
          "Amount",
          dj.Amount === 0 ? null : serializeInt(dj.Amount),
          KARMA_DELTA_FIELD_ORDER,
        ),
      },
    ];
    deltas.push({ index: i, subId, actions });
  }

  if (json.Deltas.length < deltaIds.length) {
    warnings.push(
      `.tres has ${deltaIds.length} deltas but JSON has ${json.Deltas.length}; trailing .tres deltas left untouched (structural mutation deferred)`,
    );
  }

  return { resourceActions, deltas, warnings };
}

// ---- Helpers ---------------------------------------------------------------

function getAttrValue(section: Section, key: string): string | undefined {
  const a = section.attrs.find((x) => x.key === key);
  if (!a) return undefined;
  const v = a.rawValue;
  if (v.startsWith('"') && v.endsWith('"')) return v.substring(1, v.length - 1);
  return v;
}

// Extracts the sub_resource ids referenced by the `Deltas` property's value
// in source order. Value text shape: `[SubResource("X"), SubResource("Y")]`.
function extractDeltaSubIds(resourceSection: Section): string[] {
  const entry = resourceSection.body.find(
    (e) => e.kind === "property" && e.key === "Deltas",
  );
  if (!entry || entry.kind !== "property") return [];
  const ids: string[] = [];
  const re = /SubResource\("([^"]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry.rawAfterEquals)) !== null) {
    ids.push(m[1]!);
  }
  return ids;
}
