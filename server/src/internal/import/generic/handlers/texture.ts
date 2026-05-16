// Texture reader. Resolves a Texture2D ExtResource ref → absolute
// filesystem path via ctx.resPathToAbs. AtlasTexture sub_resources are
// the special case: JSON stays empty string ("") and the writer's
// existing reconcileTextureField preserves the AtlasTexture on save.
// Phase 5's round-trip harness validates that contract from both ends.
//
// Phase 2 implementation; Phase 1 stub.

import type { FieldReader } from "../types.js";

export const textureHandler: FieldReader = () => {
  throw new Error("textureHandler not implemented (v0.2.8 Phase 2)");
};
