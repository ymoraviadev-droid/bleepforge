// Int + float handlers.
//
// Both serialize as Godot's bare-number form. Default-aware emit: when
// the value matches the declared default (or 0 when none is declared),
// return null — matching Godot's omit-default behavior.
//
// Float formatting matters here: Godot emits whole-number floats with
// a trailing `.0` (`30.0`, not `30`) so the parser can distinguish int
// fields from float fields when re-loading. Bleepforge's int handler
// uses bare `String(n)` via the shared `serializeInt`; the float
// handler appends `.0` when needed.

import { serializeInt } from "../../mutate.js";
import type { FieldHandler } from "../types.js";

export const intHandler: FieldHandler = (jsonValue, fieldDef, _section, _propName, _ctx) => {
  if (fieldDef.type !== "int") {
    throw new Error(`intHandler: unsupported field type "${fieldDef.type}"`);
  }
  const value = coerceNumber(jsonValue, "int");
  if (!Number.isInteger(value)) {
    throw new Error(`int field expects an integer, got ${value}`);
  }
  const defaultValue = fieldDef.default ?? 0;
  if (value === defaultValue) return null;
  return serializeInt(value);
};

export const floatHandler: FieldHandler = (jsonValue, fieldDef, _section, _propName, _ctx) => {
  if (fieldDef.type !== "float") {
    throw new Error(`floatHandler: unsupported field type "${fieldDef.type}"`);
  }
  const value = coerceNumber(jsonValue, "float");
  const defaultValue = fieldDef.default ?? 0;
  if (value === defaultValue) return null;
  return serializeFloat(value);
};

// Godot emits whole-number floats with a trailing `.0` so the parser
// can distinguish int from float on re-load. `30` becomes `30.0`;
// `3.14` stays `3.14`; negative zero is normalized to `0.0` (Godot
// doesn't preserve the sign). Non-finite values are an error — Godot
// would silently coerce them, but we'd rather catch the upstream bug.
function serializeFloat(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`float field expects a finite number, got ${n}`);
  }
  if (Object.is(n, -0)) return "0.0";
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}

function coerceNumber(jsonValue: unknown, type: string): number {
  if (jsonValue === undefined || jsonValue === null) return 0;
  if (typeof jsonValue === "number") return jsonValue;
  throw new Error(`${type} field expects a number, got ${typeof jsonValue}`);
}
