// String / multiline / flag handlers.
//
// All three serialize as Godot's quoted-string form. They share the
// same default-aware emit rule: when the value matches the field's
// declared default (or `""` when none is declared), return null so the
// orchestrator omits the property line — matching Godot's own behavior
// of dropping empty strings on save.
//
// `multiline` and `flag` are distinct field types only at the form
// layer (textarea vs autocomplete vs plain input). On the .tres side
// they're indistinguishable from `string`. FoB's existing per-domain
// mappers serialize all three via the same `serializeString` helper;
// the generic mapper preserves that shape so byte-identical output is
// achievable on migration.
//
// `serializeString` itself already escapes \n / \r / \t / " / \, so
// multiline values round-trip safely without needing Godot's `"""`
// triple-quote delimiter (which FoB's corpus doesn't use). If a future
// schema needs the triple-quote form, the handler can decide based on
// content shape.

import { serializeString } from "../../mutate.js";
import type { FieldHandler } from "../types.js";

export const stringHandler: FieldHandler = (jsonValue, fieldDef, _section, _propName, _ctx) => {
  if (fieldDef.type !== "string" && fieldDef.type !== "multiline" && fieldDef.type !== "flag") {
    throw new Error(`stringHandler: unsupported field type "${fieldDef.type}"`);
  }
  const value = coerceString(jsonValue, fieldDef.type);
  const defaultValue = fieldDef.default ?? "";
  if (value === defaultValue) return null;
  return serializeString(value);
};

function coerceString(jsonValue: unknown, type: string): string {
  if (jsonValue === undefined || jsonValue === null) return "";
  if (typeof jsonValue === "string") return jsonValue;
  throw new Error(`${type} field expects a string, got ${typeof jsonValue}`);
}
