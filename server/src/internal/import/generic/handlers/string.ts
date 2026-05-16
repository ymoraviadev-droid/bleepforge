// String / multiline / flag reader. All three render in the editor as
// distinct controls (single-line input / textarea / autocomplete chip)
// but share an identical .tres representation — a quoted string literal,
// or absence-means-default. One handler covers all three types.
//
// Phase 2 lands the real implementation. Phase 1 stub throws to surface
// any accidental dispatch (orchestrator gates this off until Phase 2).

import type { FieldReader } from "../types.js";

export const stringHandler: FieldReader = () => {
  throw new Error("stringHandler not implemented (v0.2.8 Phase 2)");
};
