// Cross-domain reference reader. Reads an ExtResource(id) value, looks
// up the ext_resource, then asks ProjectIndex for the matching entity
// id via ctx.resolveRefByExtResource. Dangling refs (target not in
// index) stay as the verbatim res:// string with a warning — mirrors
// the writer's tolerance for dangling refs in JSON.
//
// Phase 2 implementation; Phase 1 stub.

import type { FieldReader } from "../types.js";

export const refHandler: FieldReader = () => {
  throw new Error("refHandler not implemented (v0.2.8 Phase 2)");
};
