// `showWhen` predicate evaluation.
//
// Per the locked spec (v0.2.6 Phase 0): `showWhen` is a sibling-field
// predicate that gates BOTH UI rendering AND .tres writeback. When a
// field's showWhen doesn't apply, the field is hidden in the form AND
// omitted from .tres output. Same primitive, dual-purpose — cleaner
// files, smaller diffs, matches what the user sees.
//
// Example: Quest Objective's TargetItem only applies when
// `Type=CollectItem`. The Bleepforge form hides the field for other
// types; the writeback drops the property line.
//
// The orchestrator calls `isFieldApplicable` before dispatching to a
// handler. If false, the line is removed from .tres regardless of the
// JSON value (the JSON may still carry stale data from a prior state).

import type { ShowWhen, ShowWhenValue } from "@bleepforge/shared";

export function isFieldApplicable(
  showWhen: ShowWhen | undefined,
  json: Record<string, unknown>,
): boolean {
  if (!showWhen) return true;
  for (const [siblingKey, expected] of Object.entries(showWhen)) {
    const actual = json[siblingKey];
    if (!matchesValue(actual, expected)) return false;
  }
  return true;
}

function matchesValue(actual: unknown, expected: ShowWhenValue): boolean {
  if (Array.isArray(expected)) {
    return expected.some((v) => primitiveEquals(actual, v));
  }
  return primitiveEquals(actual, expected);
}

function primitiveEquals(
  actual: unknown,
  expected: string | number | boolean,
): boolean {
  // Strict equality is correct here — the JSON value comes from a typed
  // entity, and the manifest's expected value is one of {string, number,
  // boolean}. No coercion needed.
  return actual === expected;
}
