// Public surface of the GDShader → GLSL ES translator + WebGL2 runtime.
// React components import from here so they don't need to know the
// internal split between parser / emit / runtime / subset.

export { parseGdshader } from "./parser";
export type {
  ParseFailure,
  ParseResult,
  ParseSuccess,
  UniformDecl,
  UniformHint,
  UniformType,
} from "./parser";

export { emitGlsl, mapEmittedLineToUser } from "./emit";
export type { EmitResult } from "./emit";

export { ShaderRuntime } from "./runtime";
export type { CompileError, CompileResult, UniformValue } from "./runtime";
