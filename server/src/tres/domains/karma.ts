import type { Doc, Section } from "../types.js";
import {
  buildSubResourceSection,
  getAttrValue,
  reconcileProperty,
  reconcileSubResourceArray,
  serializeEnumInt,
  serializeInt,
  serializeString,
  type ReconcileAction,
  type SubArrayReconcileResult,
} from "../mutate.js";

// Maps Bleepforge's KarmaImpact JSON onto a parsed .tres. Now id-aware:
// each delta in JSON carries an `_subId` that mirrors its sub_resource id
// in the .tres. Reorder, add, update, remove all work via `_subId` matching.

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

const KARMA_DELTA_SCRIPT_PATH = "res://shared/components/karma/KarmaDelta.cs";

export interface KarmaDeltaJson {
  _subId?: string;
  Faction: string;
  Amount: number;
}

export interface KarmaJson {
  Id: string;
  Description: string;
  Deltas: KarmaDeltaJson[];
}

export interface KarmaApplyResult {
  resourceActions: { key: string; action: ReconcileAction }[];
  deltasUpdated: SubArrayReconcileResult["updated"];
  deltasAdded: SubArrayReconcileResult["added"];
  deltasRemoved: SubArrayReconcileResult["removed"];
  warnings: string[];
}

export function applyKarma(doc: Doc, json: KarmaJson): KarmaApplyResult {
  const warnings: string[] = [];
  const resourceSection = doc.sections.find((s) => s.kind === "resource");
  if (!resourceSection) {
    warnings.push("no [resource] section");
    return {
      resourceActions: [],
      deltasUpdated: [],
      deltasAdded: [],
      deltasRemoved: [],
      warnings,
    };
  }

  // Look up the KarmaDelta.cs script ext_resource — needed to build new
  // delta sub_resources. Existing karma files always have at least one delta
  // and thus already reference KarmaDelta.cs.
  const deltaScriptExt = findScriptExtResource(doc, KARMA_DELTA_SCRIPT_PATH);

  const arrayResult = reconcileSubResourceArray(
    doc,
    resourceSection,
    "Deltas",
    KARMA_FIELD_ORDER,
    json.Deltas,
    {
      reconcileExisting: (section, dj) => reconcileDeltaScalars(section, dj),
      buildNew: (dj, subId) => {
        if (!deltaScriptExt) {
          warnings.push(
            `cannot append delta: KarmaDelta.cs ext_resource not present in this .tres`,
          );
          return null;
        }
        return buildKarmaDeltaSubResource(dj, deltaScriptExt, subId);
      },
      insertBefore: "resource",
    },
  );

  // Main [resource] scalars.
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

  return {
    resourceActions,
    deltasUpdated: arrayResult.updated,
    deltasAdded: arrayResult.added,
    deltasRemoved: arrayResult.removed,
    warnings,
  };
}

// Backwards-compatible alias.
export const applyKarmaScalars = applyKarma;

// ---- Helpers ---------------------------------------------------------------

function reconcileDeltaScalars(
  section: Section,
  dj: KarmaDeltaJson,
): { key: string; action: ReconcileAction }[] {
  return [
    {
      key: "Faction",
      action: reconcileProperty(
        section,
        "Faction",
        dj.Faction === "Scavengers" ? null : serializeEnumInt(dj.Faction, FACTION_TO_INT),
        KARMA_DELTA_FIELD_ORDER,
      ),
    },
    {
      key: "Amount",
      action: reconcileProperty(
        section,
        "Amount",
        dj.Amount === 0 ? null : serializeInt(dj.Amount),
        KARMA_DELTA_FIELD_ORDER,
      ),
    },
  ];
}

function buildKarmaDeltaSubResource(
  dj: KarmaDeltaJson,
  scriptExt: { id: string; uid: string },
  subId: string,
): Section {
  const props: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExt.id}")` },
  ];
  if (dj.Faction !== "Scavengers") {
    props.push({ key: "Faction", rawValue: serializeEnumInt(dj.Faction, FACTION_TO_INT) });
  }
  if (dj.Amount !== 0) {
    props.push({ key: "Amount", rawValue: serializeInt(dj.Amount) });
  }
  props.push({
    key: "metadata/_custom_type_script",
    rawValue: serializeString(scriptExt.uid),
  });
  return buildSubResourceSection({ type: "Resource", id: subId, properties: props });
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
