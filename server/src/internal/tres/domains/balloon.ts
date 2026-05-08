import type { Doc, Section } from "../types.js";
import {
  reconcileProperty,
  serializeString,
  type ReconcileAction,
} from "../mutate.js";

// Maps Bleepforge's Balloon JSON onto a parsed BalloonLine .tres. Three
// authored fields, all scalars — no sub-resources, no enums, no FK
// resolution. The Bleepforge `Id` field is intentionally NOT written back
// (BalloonLine has no Id property in C#); the .tres filename is the
// identity.

export const BALLOON_FIELD_ORDER: readonly string[] = [
  "script",
  "Text",
  "TypeSpeed",
  "HoldDuration",
  "metadata/_custom_type_script",
];

export interface BalloonJson {
  Id: string;
  Text: string;
  TypeSpeed: number;
  HoldDuration: number;
}

export interface BalloonApplyResult {
  actions: { key: string; action: ReconcileAction }[];
  warnings: string[];
}

export function applyBalloonScalars(doc: Doc, json: BalloonJson): BalloonApplyResult {
  const warnings: string[] = [];
  const resourceSection = doc.sections.find((s) => s.kind === "resource");
  if (!resourceSection) {
    warnings.push("no [resource] section");
    return { actions: [], warnings };
  }

  const actions: BalloonApplyResult["actions"] = [];
  actions.push({
    key: "Text",
    action: reconcileProperty(
      resourceSection,
      "Text",
      // BalloonLine.Text default is "" — Godot omits the line when empty.
      json.Text === "" ? null : serializeString(json.Text),
      BALLOON_FIELD_ORDER,
    ),
  });
  actions.push({
    key: "TypeSpeed",
    action: reconcileProperty(
      resourceSection,
      "TypeSpeed",
      // Default is 30.0; omit when unchanged.
      json.TypeSpeed === 30 || json.TypeSpeed === 30.0
        ? null
        : serializeFloat(json.TypeSpeed),
      BALLOON_FIELD_ORDER,
    ),
  });
  actions.push({
    key: "HoldDuration",
    action: reconcileProperty(
      resourceSection,
      "HoldDuration",
      // Default is 2.0; omit when unchanged.
      json.HoldDuration === 2 || json.HoldDuration === 2.0
        ? null
        : serializeFloat(json.HoldDuration),
      BALLOON_FIELD_ORDER,
    ),
  });

  return { actions, warnings };
}

// Quick fallback used to mirror Section bodies ignored above. Exposed in
// case future shared mutators want to reuse it.
export function balloonResourceSection(doc: Doc): Section | undefined {
  return doc.sections.find((s) => s.kind === "resource");
}

// Godot writes floats with a trailing ".0" when integer-valued (e.g. "0.0",
// "30.0"). Reproduce that so re-emit is byte-identical when nothing changed.
function serializeFloat(n: number): string {
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}
