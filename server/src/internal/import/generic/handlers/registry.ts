// Field-type → handler lookup table.
//
// Symmetric with the writer's handler registry at
// `../../tres/generic/handlers/registry.ts`. The orchestrator dispatches
// via `getHandler(fieldType)` rather than a switch so adding a new field
// type means dropping a new file under `handlers/` and registering it
// here — no orchestrator changes.
//
// Phase 1 wires 10 entries (Phase 2 implements the bodies):
//   - 7 scalars via the three string-shaped types collapsing onto one
//     handler (string + multiline + flag → stringHandler)
//   - 1 numeric pair (int → intHandler, float → floatHandler)
//   - bool, enum, ref, texture, scene, array, subresource each get a
//     dedicated handler
// Total: 12 FieldType values, 9 handler files (string covers 3 types,
// numeric covers 2).

import type { FieldType } from "@bleepforge/shared";
import { arrayHandler } from "./array.js";
import { boolHandler } from "./bool.js";
import { enumHandler } from "./enum.js";
import { floatHandler, intHandler } from "./numeric.js";
import { refHandler } from "./ref.js";
import { sceneHandler } from "./scene.js";
import { stringHandler } from "./string.js";
import { subresourceHandler } from "./subresource.js";
import { textureHandler } from "./texture.js";
import type { FieldReader } from "../types.js";

const HANDLERS: Partial<Record<FieldType, FieldReader>> = {
  string: stringHandler,
  multiline: stringHandler,
  flag: stringHandler,
  int: intHandler,
  float: floatHandler,
  bool: boolHandler,
  enum: enumHandler,
  ref: refHandler,
  texture: textureHandler,
  scene: sceneHandler,
  array: arrayHandler,
  subresource: subresourceHandler,
};

export function getHandler(type: FieldType): FieldReader | null {
  return HANDLERS[type] ?? null;
}
