// Shape of a .gdshader file descriptor surfaced to clients. Built by the
// discovery pass + sidecar parse. Returned by /api/shaders.
//
// Phase 1 is read-only: we don't track a `subsetSupported` flag yet — the
// translator (Phase 3) will add it, defaulting to true until the parser
// learns about each unsupported feature. Until then every shader is just
// "viewable + has usages".

import type { ShaderPattern } from "@bleepforge/shared";

export type ShaderType =
  | "canvas_item"
  | "spatial"
  | "particles"
  | "sky"
  | "fog";

export interface ShaderAsset {
  /** Absolute filesystem path to the .gdshader file. */
  path: string;
  /** Basename including extension ("scanlines.gdshader"). */
  basename: string;
  /** Parent directory path (absolute). */
  parentDir: string;
  /** Path-relative-to-Godot-root for display ("shared/shaders"). */
  parentRel: string;
  /** UID from the .gdshader.uid sidecar. Null when no sidecar — uncommon
   *  but possible for shaders Godot hasn't processed yet. */
  uid: string | null;
  /** First "shader_type X;" declaration. Null if malformed / missing. */
  shaderType: ShaderType | null;
  /** Number of `uniform` declarations counted in source. Useful for the
   *  list-page card to surface complexity at a glance. */
  uniformCount: number;
  /** Bytes on disk. */
  sizeBytes: number;
  /** Modified-at timestamp (ms since epoch). */
  mtimeMs: number;
  /** Bleepforge-only card pattern picked by the user. Null when no
   *  pattern is set (client falls back to a default). Stored in
   *  data/shaders/_meta.json keyed by project-relative path. */
  pattern: ShaderPattern | null;
}

/** Live event published when a .gdshader file changes on disk. Phase 2
 *  wires this into the watcher; Phase 1 ships the type definition so the
 *  router can stub the SSE endpoint at a later date without an API
 *  surface change. */
export interface ShaderEvent {
  kind: "added" | "changed" | "removed";
  path: string;
}
