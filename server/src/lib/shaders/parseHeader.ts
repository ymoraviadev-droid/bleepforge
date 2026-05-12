// Lightweight header parse for .gdshader source. Pulls out just enough
// metadata for the list-page card (shader_type + uniform count). The
// full GDShader parser — the one that drives the Phase 3 translator —
// will live in the client-side translator/ folder, since translation
// only runs client-side; this stays a tiny server-side header sniff.

import type { ShaderType } from "./types.js";

const SHADER_TYPE_RE = /^\s*shader_type\s+([a-z_]+)\s*;/m;
const UNIFORM_RE = /^\s*uniform\s+/gm;

const KNOWN_TYPES: readonly ShaderType[] = [
  "canvas_item",
  "spatial",
  "particles",
  "sky",
  "fog",
];

function isKnownType(raw: string | null | undefined): raw is ShaderType {
  if (!raw) return false;
  return (KNOWN_TYPES as readonly string[]).includes(raw);
}

export interface ShaderHeader {
  shaderType: ShaderType | null;
  uniformCount: number;
}

export function parseShaderHeader(source: string): ShaderHeader {
  const typeMatch = SHADER_TYPE_RE.exec(source);
  const raw = typeMatch?.[1] ?? null;
  const shaderType: ShaderType | null = isKnownType(raw) ? raw : null;

  // matchAll on a global regex — count the iterator entries without
  // materializing the array.
  let uniformCount = 0;
  for (const _ of source.matchAll(UNIFORM_RE)) uniformCount++;

  return { shaderType, uniformCount };
}
