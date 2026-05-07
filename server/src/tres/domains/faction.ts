import type { Section } from "../types.js";
import {
  reconcileProperty,
  serializeEnumInt,
  serializeString,
} from "../mutate.js";

// Maps Bleepforge's FactionData JSON onto a parsed `[resource]` section.
// Scalar-only writes for now; Icon/Banner ext-resources are NOT updated
// (same approach as Item.Icon — deferred until a structural phase). The
// Faction enum field is the identity discriminator and is not reconciled
// either (changing which Faction value a file represents is effectively
// a different file).

export const FACTION_TO_INT: Record<string, number> = {
  Scavengers: 0,
  FreeRobots: 1,
  RFF: 2,
  Grove: 3,
};

export const FACTION_FIELD_ORDER: readonly string[] = [
  "script",
  "Faction",
  "DisplayName",
  "Icon",
  "Banner",
  "ShortDescription",
  "metadata/_custom_type_script",
];

export interface FactionJson {
  Faction: string;
  DisplayName: string;
  Icon: string;
  Banner: string;
  ShortDescription: string;
}

export interface ApplyResult {
  actions: { key: string; action: "updated" | "inserted" | "removed" | "noop" }[];
  warnings: string[];
}

export function applyFactionScalars(
  section: Section,
  json: FactionJson,
): ApplyResult {
  const actions: ApplyResult["actions"] = [];
  const warnings: string[] = [];

  // Faction discriminator: only write when it's non-default (Scavengers=0).
  // Godot omits enum=0; we mirror that. Outside this single line we don't
  // touch identity — the importer assigns one .tres per Faction enum value.
  actions.push({
    key: "Faction",
    action: reconcileProperty(
      section,
      "Faction",
      json.Faction === "Scavengers"
        ? null
        : serializeEnumInt(json.Faction, FACTION_TO_INT),
      FACTION_FIELD_ORDER,
    ),
  });

  actions.push({
    key: "DisplayName",
    action: reconcileProperty(
      section,
      "DisplayName",
      json.DisplayName === "" ? null : serializeString(json.DisplayName),
      FACTION_FIELD_ORDER,
    ),
  });

  actions.push({
    key: "ShortDescription",
    action: reconcileProperty(
      section,
      "ShortDescription",
      json.ShortDescription === ""
        ? null
        : serializeString(json.ShortDescription),
      FACTION_FIELD_ORDER,
    ),
  });

  // Icon/Banner ext-resources intentionally not reconciled (parity with Item.Icon).

  return { actions, warnings };
}
