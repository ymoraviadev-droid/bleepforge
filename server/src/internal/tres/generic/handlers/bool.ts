// Bool handler.
//
// Serializes as `true` / `false`. Default-aware emit: when the value
// matches the declared default (or `false` when none is declared),
// return null. Matches Godot's omit-false-by-default behavior for
// `bool` exports.

import { serializeBool } from "../../mutate.js";
import type { FieldHandler } from "../types.js";

export const boolHandler: FieldHandler = (jsonValue, fieldDef) => {
  if (fieldDef.type !== "bool") {
    throw new Error(`boolHandler: unsupported field type "${fieldDef.type}"`);
  }
  const value = coerceBool(jsonValue);
  const defaultValue = fieldDef.default ?? false;
  if (value === defaultValue) return null;
  return serializeBool(value);
};

function coerceBool(jsonValue: unknown): boolean {
  if (jsonValue === undefined || jsonValue === null) return false;
  if (typeof jsonValue === "boolean") return jsonValue;
  throw new Error(`bool field expects a boolean, got ${typeof jsonValue}`);
}
