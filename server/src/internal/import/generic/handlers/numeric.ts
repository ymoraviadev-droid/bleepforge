// Numeric readers (int + float). Both share a TresValue "number" kind;
// the FieldDef.type drives whether the JSON value is coerced to int via
// Math.trunc or kept as-is.
//
// Phase 2 implementation; Phase 1 stub.

import type { FieldReader } from "../types.js";

export const intHandler: FieldReader = () => {
  throw new Error("intHandler not implemented (v0.2.8 Phase 2)");
};

export const floatHandler: FieldReader = () => {
  throw new Error("floatHandler not implemented (v0.2.8 Phase 2)");
};
