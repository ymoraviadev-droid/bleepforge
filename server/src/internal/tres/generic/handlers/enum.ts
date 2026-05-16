// Enum handler.
//
// Manifest stores enum values as a string array (e.g.
// `["Scavengers", "FreeRobots", "RFF", "Grove"]`). The library reflects
// these from the user's C# enum in declaration order, so the array
// index equals the underlying int Godot serializes.
//
// JSON carries the value as a string name; the .tres carries it as an
// int. The handler maps name → array index and emits the int via
// `serializeEnumInt`.
//
// Default-aware emit: when the value matches the declared default
// (or the FIRST value in `values` when none is declared — Godot's
// "enum int 0 is default" convention), return null.

import type { FieldHandler } from "../types.js";

export const enumHandler: FieldHandler = (jsonValue, fieldDef, _section, _propName, _ctx) => {
  if (fieldDef.type !== "enum") {
    throw new Error(`enumHandler: unsupported field type "${fieldDef.type}"`);
  }
  const value = coerceString(jsonValue);
  const defaultValue = fieldDef.default ?? fieldDef.values[0]!;
  if (value === defaultValue) return null;
  const index = fieldDef.values.indexOf(value);
  if (index < 0) {
    throw new Error(
      `enum field expects one of [${fieldDef.values.join(", ")}], got "${value}"`,
    );
  }
  return String(index);
};

function coerceString(jsonValue: unknown): string {
  if (jsonValue === undefined || jsonValue === null) return "";
  if (typeof jsonValue === "string") return jsonValue;
  throw new Error(`enum field expects a string, got ${typeof jsonValue}`);
}
