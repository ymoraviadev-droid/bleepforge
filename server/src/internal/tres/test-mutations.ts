// Per-type mutation test. For each scalar value type, applies a synthetic
// change to a known .tres, emits, and verifies the resulting file differs
// from the original by exactly one line.
//
// Read-only against GODOT_PROJECT_ROOT. No staged files written — diffs are
// computed in memory.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseTres } from "./parser.js";
import { emitTres } from "./emitter.js";
import {
  reconcileProperty,
  serializeBool,
  serializeEnumInt,
  serializeInt,
  serializeString,
  setPropertyRaw,
} from "./mutate.js";
import { ITEM_CATEGORY_TO_INT, ITEM_FIELD_ORDER } from "./domains/item.js";

type Action = "updated" | "inserted" | "removed" | "noop";

interface TestCase {
  name: string;
  // Either a direct setProperty (legacy) or a reconcile (new).
  op:
    | { kind: "set"; key: string; value: string }
    | { kind: "reconcile"; key: string; value: string | null };
  // Expected counts in the LCS-style line diff.
  //   update = { added: 1, removed: 1 }
  //   insert = { added: 1, removed: 0 }
  //   remove = { added: 0, removed: 1 }
  //   noop   = { added: 0, removed: 0 }
  expectDiff: { added: number; removed: number };
  expectAction?: Action;
}

const ITEM_REL_PATH = "world/collectibles/keycards/data/rff_keycard.tres";

const UPDATE = { added: 1, removed: 1 };
const INSERT = { added: 1, removed: 0 };
const REMOVE = { added: 0, removed: 1 };
const NOOP = { added: 0, removed: 0 };

const TESTS: TestCase[] = [
  // ---- setPropertyRaw cases (update / noop only) ----
  { name: "string change", op: { kind: "set", key: "DisplayName", value: serializeString("Test Display") }, expectDiff: UPDATE },
  { name: "string idempotent", op: { kind: "set", key: "DisplayName", value: serializeString("R.F.F Keycard") }, expectDiff: NOOP },
  { name: "int change", op: { kind: "set", key: "Price", value: serializeInt(750) }, expectDiff: UPDATE },
  { name: "int idempotent", op: { kind: "set", key: "Price", value: serializeInt(500) }, expectDiff: NOOP },
  { name: "bool change", op: { kind: "set", key: "IsStackable", value: serializeBool(true) }, expectDiff: UPDATE },
  { name: "bool idempotent", op: { kind: "set", key: "IsStackable", value: serializeBool(false) }, expectDiff: NOOP },
  {
    name: "multiline string",
    op: { kind: "set", key: "Description", value: serializeString("Line one\nLine two\twith tab") },
    expectDiff: UPDATE,
  },

  // ---- reconcileProperty cases (insert / update / remove / noop) ----
  {
    name: "reconcile insert — Category=Weapon",
    op: { kind: "reconcile", key: "Category", value: serializeEnumInt("Weapon", ITEM_CATEGORY_TO_INT) },
    expectDiff: INSERT,
    expectAction: "inserted",
  },
  {
    name: "reconcile insert — MaxStack=42",
    op: { kind: "reconcile", key: "MaxStack", value: serializeInt(42) },
    expectDiff: INSERT,
    expectAction: "inserted",
  },
  {
    name: "reconcile remove — Price",
    op: { kind: "reconcile", key: "Price", value: null },
    expectDiff: REMOVE,
    expectAction: "removed",
  },
  {
    name: "reconcile noop — Category null",
    op: { kind: "reconcile", key: "Category", value: null },
    expectDiff: NOOP,
    expectAction: "noop",
  },
  {
    name: "reconcile noop — Price=500",
    op: { kind: "reconcile", key: "Price", value: serializeInt(500) },
    expectDiff: NOOP,
    expectAction: "noop",
  },
  {
    name: "reconcile update — Price=999",
    op: { kind: "reconcile", key: "Price", value: serializeInt(999) },
    expectDiff: UPDATE,
    expectAction: "updated",
  },
];

async function main(): Promise<void> {
  const root = process.env.GODOT_PROJECT_ROOT;
  if (!root) {
    console.error("GODOT_PROJECT_ROOT not set.");
    process.exit(2);
  }
  const abs = resolve(root, ITEM_REL_PATH);
  const original = await readFile(abs, "utf8");

  console.log(`[test-mutations] target: ${abs}`);
  console.log("");

  let passed = 0;
  let failed = 0;
  for (const tc of TESTS) {
    const doc = parseTres(original);
    const resourceSection = doc.sections.find((s) => s.kind === "resource");
    if (!resourceSection) {
      console.log(`  FAIL: ${tc.name} — no [resource] section`);
      failed++;
      continue;
    }

    let actualAction: Action | "set-ok" | "set-miss";
    if (tc.op.kind === "set") {
      actualAction = setPropertyRaw(resourceSection, tc.op.key, tc.op.value) ? "set-ok" : "set-miss";
    } else {
      actualAction = reconcileProperty(resourceSection, tc.op.key, tc.op.value, ITEM_FIELD_ORDER);
    }
    const emitted = emitTres(doc);
    const stats = lineDiffStats(original, emitted);

    const diffOk = stats.added === tc.expectDiff.added && stats.removed === tc.expectDiff.removed;
    const actionOk = tc.expectAction ? actualAction === tc.expectAction : true;
    const status: "PASS" | "FAIL" = diffOk && actionOk ? "PASS" : "FAIL";
    const diffStr = `+${stats.added}/-${stats.removed}`;
    const expectedStr = `+${tc.expectDiff.added}/-${tc.expectDiff.removed}`;
    const detail =
      status === "PASS"
        ? `${diffStr}${tc.expectAction ? ` (action: ${actualAction})` : ""}`
        : `expected ${expectedStr}${tc.expectAction ? `, action=${tc.expectAction}` : ""}; got ${diffStr}, action=${actualAction}`;

    if (status === "PASS") passed++;
    else failed++;
    console.log(`  ${status}: ${tc.name} — ${detail}`);
  }

  console.log("");
  console.log(`[test-mutations] ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// LCS-based line diff. Returns the number of lines that would appear with
// a `-` prefix (removed from a) and `+` prefix (added in b) in a unified
// diff. update = +1/-1, insert = +1/-0, remove = +0/-1, noop = +0/-0.
function lineDiffStats(a: string, b: string): { added: number; removed: number } {
  const A = a.split("\n");
  const B = b.split("\n");
  const m = A.length;
  const n = B.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (A[i - 1] === B[j - 1]) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const lcs = dp[m]![n]!;
  return { added: n - lcs, removed: m - lcs };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
