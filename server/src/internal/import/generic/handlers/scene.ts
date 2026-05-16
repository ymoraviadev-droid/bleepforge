// PackedScene reader. ExtResource ref → res:// path of the .tscn,
// resolved through ProjectIndex (which also indexes .tscn pickups).
// JSON value is the res:// path verbatim — matches the writer's
// expectation for round-trip.
//
// Phase 2 implementation; Phase 1 stub.

import type { FieldReader } from "../types.js";

export const sceneHandler: FieldReader = () => {
  throw new Error("sceneHandler not implemented (v0.2.8 Phase 2)");
};
