// Enum reader. `.tres` represents enums as their integer index; the
// FieldDef.values array maps index → string name (the form Bleepforge
// JSON uses).
//
// Phase 2 implementation; Phase 1 stub.

import type { FieldReader } from "../types.js";

export const enumHandler: FieldReader = () => {
  throw new Error("enumHandler not implemented (v0.2.8 Phase 2)");
};
