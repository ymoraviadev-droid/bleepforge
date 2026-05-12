// Shared diagnostic shape used by the shader edit page. Parser
// rejections, translator-level subset violations, and WebGL compile
// errors all collapse to this same record, so the editor's gutter
// markers (via @codemirror/lint) and the preview pane's red banner
// can render from a single source of truth.
//
// `line` is 1-indexed against the USER source — the parser produces
// it directly; the WebGL compile-error parser maps emitted-GLSL line
// numbers back via emit.ts's source-map fields before producing one
// of these.

export interface ShaderDiagnostic {
  /** 1-indexed line in the user's editor doc. */
  line: number;
  severity: "error" | "warning";
  message: string;
  /** Where the diagnostic came from. Drives the gutter tooltip's
   *  source label so the user can tell parser rejections (precise,
   *  Bleepforge-specific reasons) apart from WebGL compile output
   *  (terser, GLSL-driver-flavored). */
  source: "translator" | "webgl";
}
