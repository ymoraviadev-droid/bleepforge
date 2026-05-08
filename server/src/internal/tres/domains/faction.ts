import type { Doc, Section } from "../types.js";
import {
  reconcileProperty,
  serializeEnumInt,
  serializeString,
} from "../mutate.js";
import {
  reconcileTextureField,
  type TextureRefContext,
} from "../textureRef.js";

// Maps Bleepforge's FactionData JSON onto a parsed `[resource]` section.
// Reconciles every scalar plus the Icon and Banner Texture2D refs. The
// Faction enum is the identity discriminator and is not reconciled (changing
// which Faction value a file represents is effectively a different file).
//
// Icon/Banner go through reconcileTextureField — same path as Item.Icon —
// which preserves SubResource (AtlasTexture) lines if we ever encounter
// them. In the current corpus all faction Icons + Banners are Texture2D
// ExtResources, so the simple swap path is the common one here.

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
  actions: {
    key: string;
    action: "updated" | "inserted" | "removed" | "noop" | "preserved";
  }[];
  warnings: string[];
}

export function applyFactionScalars(
  doc: Doc,
  section: Section,
  json: FactionJson,
  textureCtx: TextureRefContext,
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

  // Icon + Banner — Texture2D ExtResources (with AtlasTexture preservation
  // for safety, though no current faction uses one).
  for (const key of ["Icon", "Banner"] as const) {
    const result = reconcileTextureField(
      doc,
      section,
      key,
      FACTION_FIELD_ORDER,
      json[key],
      textureCtx,
      `faction "${json.Faction}"`,
    );
    actions.push({ key, action: result.action });
    warnings.push(...result.warnings);
  }

  return { actions, warnings };
}
