// Single inline sub_resource reader. The .tres value is SubResource(id)
// pointing at a sub_resource section; the section's props get walked
// through the orchestrator's flat-field loop using the manifest
// SubResource declaration's fields + fieldOrder. `_subId` populates
// from the section id.
//
// NpcData.LootTable is the canonical FoB instance — a single inline
// sub_resource that wraps an Entries[] array, which itself is an
// array.of<LootEntry>. So a sub_resource reader recurses into the
// array reader, which recurses back into the sub_resource reader for
// each entry. Symmetric with the writer's reconcile pipeline.
//
// Phase 2 implementation; Phase 1 stub.

import type { FieldReader } from "../types.js";

export const subresourceHandler: FieldReader = () => {
  throw new Error("subresourceHandler not implemented (v0.2.8 Phase 2)");
};
