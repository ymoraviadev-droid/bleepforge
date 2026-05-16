// Field-type → handler lookup table.
//
// Symmetric with the writer's handler registry at
// `../../tres/generic/handlers/registry.ts`. The orchestrator dispatches
// via `getHandler(fieldType)` rather than a switch so adding a new field
// type means dropping a new file under `handlers/` and registering it
// here — no orchestrator changes.
//
// 10 entries cover all 12 FieldType values (string + multiline + flag
// collapse onto one handler; int + float share the numeric.ts file).
// `array` and `subresource` are absent here because they need their own
// signature (recurse into orchestrator.readFlatFields, can't return a
// flat JSON scalar) — the orchestrator dispatches them directly.

import type { FieldType } from "@bleepforge/shared";
import { boolHandler } from "./bool.js";
import { enumHandler } from "./enum.js";
import { floatHandler, intHandler } from "./numeric.js";
import { refHandler } from "./ref.js";
import { sceneHandler } from "./scene.js";
import { stringHandler } from "./string.js";
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
};

export function getHandler(type: FieldType): FieldReader | null {
  return HANDLERS[type] ?? null;
}
