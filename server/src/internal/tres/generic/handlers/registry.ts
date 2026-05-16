// Field-type → handler lookup table.
//
// The orchestrator dispatches via `getHandler(fieldType)` rather than a
// switch so adding a new field type means dropping a new file under
// `handlers/` and registering it here — no orchestrator changes. In
// v0.2.7 this registry is hand-wired; nothing about the dispatch shape
// requires runtime registration so we keep the simpler static form.
//
// Commit #2 covers the 7 scalar types. Commits #3-5 add ref, texture,
// scene, array, subresource.

import type { FieldType } from "@bleepforge/shared";
import { boolHandler } from "./bool.js";
import { enumHandler } from "./enum.js";
import { floatHandler, intHandler } from "./numeric.js";
import { refHandler } from "./ref.js";
import { sceneHandler } from "./scene.js";
import { stringHandler } from "./string.js";
import { textureHandler } from "./texture.js";
import type { FieldHandler } from "../types.js";

const HANDLERS: Partial<Record<FieldType, FieldHandler>> = {
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

export function getHandler(type: FieldType): FieldHandler | null {
  return HANDLERS[type] ?? null;
}
