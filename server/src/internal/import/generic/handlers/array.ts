// Array reader. Splits on the FieldDef.of vs itemRef discriminator:
//   - of: <subResource> → array of inline sub_resource objects. Each
//     entry recurses into the orchestrator's flat-field walk against
//     the sub_resource's own fields. `_subId` is populated from the
//     sub_resource id so the writer can match entries on reorder /
//     edit / remove.
//   - itemRef: <domain> → array of refs to entities in another domain
//     (NPC.CasualRemarks → balloon ids form). Each entry follows the
//     ref handler's lookup.
//
// Phase 2 implementation; Phase 1 stub.

import type { FieldReader } from "../types.js";

export const arrayHandler: FieldReader = () => {
  throw new Error("arrayHandler not implemented (v0.2.8 Phase 2)");
};
