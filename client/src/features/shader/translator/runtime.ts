// WebGL2 runtime that drives the live preview canvas. Compiles + runs
// the GLSL emitted by emit.ts on a full-screen quad, ticks u_time via
// requestAnimationFrame, exposes a small API for setting user uniforms
// and swapping the main texture.
//
// Self-contained: caller passes a <canvas>, runtime owns the GL context,
// program, buffers, and texture lifetime. `destroy()` releases
// everything cleanly so the React wrapper can unmount/remount without
// leaking WebGL state (and without losing browser GL contexts — most
// browsers cap at 8-16 live contexts per page).

import type { EmitResult } from "./emit";
import { mapEmittedLineToUser } from "./emit";
import { HINT_PREVIOUS_FRAME, HINT_SCREEN_TEXTURE } from "./subset";
import type { UniformHint } from "./parser";

/** Vertex shader stays fixed: emits a full-screen quad in NDC and a
 *  matching 0..1 UV. The fragment shader is what users author; we
 *  recompile that on every translation. */
const VERTEX_GLSL = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** Passthrough fragment shader for the base pass — samples the bound
 *  texture, no transforms. Drawn FIRST every frame (opaque, no blend);
 *  then the user shader runs on top with alpha blending. This is what
 *  Godot does conceptually for canvas_item — the sprite gets drawn,
 *  then the shader's fragment output composites over it. Without this
 *  base pass, "dimming" shaders like scanlines (which write a low
 *  alpha) just blend into the page background and look invisible. */
const PASSTHROUGH_FRAG_GLSL = `#version 300 es
precision mediump float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_texture;
void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

/** Two triangles covering NDC -1..1. Indexed via gl.drawArrays(TRIANGLES). */
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
]);

export interface CompileError {
  /** WebGL's error log line for the user (already trimmed). */
  message: string;
  /** Line number in the user's source, if we could map it. Otherwise
   *  null (e.g. error in the prelude — those would be Bleepforge bugs). */
  userLine: number | null;
  /** Line number in the EMITTED GLSL — useful for debugging the
   *  translator itself. */
  emittedLine: number | null;
}

export interface CompileResult {
  ok: boolean;
  errors: CompileError[];
}

export type UniformValue = number | number[] | boolean;

export class ShaderRuntime {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly quadBuffer: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private program: WebGLProgram | null = null;
  private fragmentShader: WebGLShader | null = null;
  private vertexShader: WebGLShader | null = null;
  /** Always-on passthrough program for the base texture pass. Compiled
   *  once at construction, never swapped. */
  private readonly passthroughProgram: WebGLProgram;
  private readonly passthroughSamplerLoc: WebGLUniformLocation | null;
  private texture: WebGLTexture | null = null;
  private textureSize: [number, number] = [1, 1];
  /** User-declared sampler2D uniforms beyond the built-in TEXTURE.
   *
   *  Two kinds:
   *  - "owned": user picked an image via the AssetPicker; we allocate
   *    a dedicated texture unit (starting at 1) and own a WebGLTexture
   *    initialized from that image. Filter/wrap from hints apply to
   *    this texture directly.
   *  - "screen": sampler was declared with `hint_screen_texture`. No
   *    own texture — at draw time we point its uniform location at
   *    unit 0 (the main TEXTURE). If its hints include filter_* or
   *    repeat_*, they get applied to u_texture (so the screen-alias
   *    sees what it asked for). Multiple screen-alias samplers with
   *    conflicting hints: first-one-wins, captured at setSamplerTextures
   *    time.
   *  Reconciled via setSamplerTextures(); freed on destroy. */
  private samplerEntries = new Map<string, SamplerEntry>();
  /** Texture parameters applied to u_texture on every setMainTexture
   *  upload. Default NEAREST+CLAMP; overridden when a screen-alias
   *  sampler declares filter/wrap hints. Lets the user write
   *  `uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_linear;`
   *  and have warped UV sampling look smooth instead of jagged. */
  private mainTextureParams: TextureParams = defaultTextureParams();

  // --- Ping-pong framebuffers for hint_previous_frame ---
  // Two color-attached FBOs swap roles each frame: "front" receives
  // this frame's render; "back" is sampled by user shaders that
  // declare a `hint_previous_frame` sampler. After both passes, the
  // front FBO blits to the canvas. Allocated lazily on first draw +
  // re-created on resize.
  private fboA: WebGLFramebuffer | null = null;
  private fboB: WebGLFramebuffer | null = null;
  private texA: WebGLTexture | null = null;
  private texB: WebGLTexture | null = null;
  private fboSize: [number, number] = [0, 0];
  private frontIsA = true;
  /** Reserved high texture unit for binding the back-FBO texture at
   *  draw time. prev_frame sampler entries route their uniform
   *  location here. Picked at construction from MAX_COMBINED -
   *  1 so it doesn't collide with owned-sampler allocations
   *  starting at 1. */
  private readonly prevFrameUnit: number;
  /** User uniform values keyed by name. Re-bound every frame. */
  private uniformValues = new Map<string, UniformValue>();
  /** Uniform locations cached per program (re-resolved on compile). */
  private uniformLocations = new Map<string, WebGLUniformLocation | null>();
  private currentEmit: EmitResult | null = null;
  private rafId: number | null = null;
  private startTime: number = performance.now();
  private running = false;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // alpha: false → canvas presents to the page compositor as opaque,
    // so whatever's behind the canvas DOM element (the dark wrapper
    // bg) can't bleed through transparent fragments. Combined with the
    // 2-pass render below, the user always sees something — the bound
    // texture as base, the shader output composited over it.
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
    });
    if (!gl) {
      throw new Error(
        "WebGL2 isn't available. The shader preview needs a WebGL2 context — try a browser version released after ~2018 or check that hardware acceleration is enabled.",
      );
    }
    this.gl = gl;
    // Default texture so the canvas shows something before the user
    // picks an image. Generated programmatically; uploaded synchronously.
    this.texture = createDefaultTexture(gl);
    this.textureSize = [DEFAULT_TEXTURE_SIZE, DEFAULT_TEXTURE_SIZE];

    // Quad geometry — single allocation reused for every compile.
    const buf = gl.createBuffer();
    if (!buf) throw new Error("WebGL2: couldn't allocate quad buffer");
    this.quadBuffer = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("WebGL2: couldn't allocate vertex array");
    this.vao = vao;
    // Set up the attribute pointer on the VAO once — both programs
    // bind a_pos to location 0 (the passthrough via bindAttribLocation
    // below, the user shader via the same call in compile()). The VAO
    // remembers the binding across program swaps.
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Compile the passthrough base-pass program. Failure here would be
    // a Bleepforge bug (the shader is fixed); propagate as a throw.
    this.passthroughProgram = compileFixedProgram(gl, VERTEX_GLSL, PASSTHROUGH_FRAG_GLSL);
    this.passthroughSamplerLoc = gl.getUniformLocation(this.passthroughProgram, "u_texture");

    // Reserve the highest texture unit for prev_frame routing. WebGL2
    // guarantees MAX_COMBINED_TEXTURE_IMAGE_UNITS >= 32; reserving the
    // top one leaves the bottom 30+ for owned samplers (unit 0 is
    // u_texture, units 1..30 are user samplers).
    const maxUnits = gl.getParameter(
      gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
    ) as number;
    this.prevFrameUnit = maxUnits - 1;
  }

  /**
   * Compile + link a new fragment shader from the emitter's output. Old
   * program is deleted on success. On failure, the previous program (if
   * any) stays bound so the preview keeps showing the last-good render.
   */
  compile(emit: EmitResult): CompileResult {
    const gl = this.gl;
    const errors: CompileError[] = [];

    const vert = gl.createShader(gl.VERTEX_SHADER);
    if (!vert) {
      errors.push({ message: "Couldn't allocate vertex shader", userLine: null, emittedLine: null });
      return { ok: false, errors };
    }
    gl.shaderSource(vert, VERTEX_GLSL);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vert) ?? "(no log)";
      gl.deleteShader(vert);
      errors.push({ message: `vertex shader: ${log.trim()}`, userLine: null, emittedLine: null });
      return { ok: false, errors };
    }

    const frag = gl.createShader(gl.FRAGMENT_SHADER);
    if (!frag) {
      gl.deleteShader(vert);
      errors.push({ message: "Couldn't allocate fragment shader", userLine: null, emittedLine: null });
      return { ok: false, errors };
    }
    gl.shaderSource(frag, emit.glsl);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(frag) ?? "(no log)";
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      for (const err of parseGlslErrors(log, emit)) errors.push(err);
      return { ok: false, errors };
    }

    const prog = gl.createProgram();
    if (!prog) {
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      errors.push({ message: "Couldn't allocate program", userLine: null, emittedLine: null });
      return { ok: false, errors };
    }
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.bindAttribLocation(prog, 0, "a_pos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? "(no log)";
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteProgram(prog);
      errors.push({ message: `link failed: ${log.trim()}`, userLine: null, emittedLine: null });
      return { ok: false, errors };
    }

    // Success — swap in the new program and tear down the old one.
    if (this.program) gl.deleteProgram(this.program);
    if (this.vertexShader) gl.deleteShader(this.vertexShader);
    if (this.fragmentShader) gl.deleteShader(this.fragmentShader);
    this.program = prog;
    this.vertexShader = vert;
    this.fragmentShader = frag;
    this.currentEmit = emit;
    this.uniformLocations.clear();

    return { ok: true, errors: [] };
  }

  /** Set a user-uniform value. Re-bound on every frame; no upload here. */
  setUniformValue(name: string, value: UniformValue): void {
    this.uniformValues.set(name, value);
  }

  /** Reset the per-frame uniform tick — useful for "restart from t=0"
   *  affordance on the preview. */
  resetTime(): void {
    this.startTime = performance.now();
  }

  /** Reconcile the user-declared sampler2D uniforms (anything beyond
   *  the built-in TEXTURE). Each entry carries an optional source
   *  (HTMLImageElement etc.) AND optional hints (filter_* / repeat_* /
   *  hint_screen_texture).
   *
   *  Behavior:
   *  - Entry with hint_screen_texture: tracked as a "screen alias" —
   *    no own texture, no own unit. At draw time its uniform location
   *    points to texture unit 0 (where u_texture lives). Filter/wrap
   *    hints (if any) get folded into mainTextureParams so the next
   *    setMainTexture upload applies them.
   *  - Entry with a source and no hint_screen_texture: owned. Allocates
   *    a fresh texture unit (1..N), uploads the image, applies the
   *    hint-derived texParameteri values.
   *  - Entry with null source and no hint_screen_texture: released.
   *  - Name absent from the record: released too. */
  setSamplerTextures(
    samplers: Record<
      string,
      | { source: TexImageSource | null; hints?: UniformHint[] }
      | TexImageSource
      | null
    >,
  ): void {
    // Release samplers not in the desired set.
    for (const name of [...this.samplerEntries.keys()]) {
      if (!(name in samplers)) this.releaseSamplerEntry(name);
    }

    // First pass: scan for screen-alias hints so we can decide what
    // texture params u_texture should get on its next upload. First
    // hint set wins on conflict (rare in practice — most shaders have
    // at most one hint_screen_texture sampler).
    let nextMainParams: TextureParams | null = null;
    for (const [, raw] of Object.entries(samplers)) {
      const normalized = normalizeSamplerInput(raw);
      if (!normalized) continue;
      const { hints } = normalized;
      if (hints.some((h) => h.name === HINT_SCREEN_TEXTURE)) {
        nextMainParams = paramsFromHints(hints, this.gl);
        break;
      }
    }
    const desiredMainParams = nextMainParams ?? defaultTextureParams();
    if (!texParamsEqual(desiredMainParams, this.mainTextureParams)) {
      this.mainTextureParams = desiredMainParams;
      if (this.texture) {
        // Re-apply on the existing main texture so the change takes
        // effect immediately, even if the user doesn't pick a new
        // image right away.
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        applyTextureParams(this.gl, this.mainTextureParams);
      }
    }

    // Second pass: set / clear each desired entry.
    for (const [name, raw] of Object.entries(samplers)) {
      const normalized = normalizeSamplerInput(raw);
      if (!normalized) {
        this.releaseSamplerEntry(name);
        continue;
      }
      const { source, hints } = normalized;
      // hint_previous_frame wins over hint_screen_texture if both are
      // present (rare). Both flip the entry into a routing role with
      // no owned texture.
      if (hints.some((h) => h.name === HINT_PREVIOUS_FRAME)) {
        const existing = this.samplerEntries.get(name);
        if (existing && existing.kind === "owned") {
          this.gl.deleteTexture(existing.texture);
        }
        this.samplerEntries.set(name, { kind: "prev_frame", hints });
        continue;
      }
      if (hints.some((h) => h.name === HINT_SCREEN_TEXTURE)) {
        // Screen alias — no source needed, no texture owned.
        // Release any owned entry under the same name (user changed
        // a uniform's hints between renders).
        const existing = this.samplerEntries.get(name);
        if (existing && existing.kind === "owned") {
          this.gl.deleteTexture(existing.texture);
        }
        this.samplerEntries.set(name, { kind: "screen" });
        continue;
      }
      if (source) {
        this.upsertSamplerEntry(name, source, hints);
      } else {
        this.releaseSamplerEntry(name);
      }
    }
  }

  private upsertSamplerEntry(
    name: string,
    source: TexImageSource,
    hints: UniformHint[],
  ): void {
    const gl = this.gl;
    let entry = this.samplerEntries.get(name);
    if (entry && entry.kind === "owned") {
      // Replace texture data on the existing entry; keep the unit.
      gl.deleteTexture(entry.texture);
      const fresh = gl.createTexture();
      if (!fresh) {
        console.warn(`[shader-runtime] couldn't allocate texture for "${name}"`);
        this.samplerEntries.delete(name);
        return;
      }
      entry.texture = fresh;
    } else {
      // Either a new entry, or upgrading a "screen" entry to "owned"
      // (user removed hint_screen_texture from the declaration).
      const unit = this.allocateTextureUnit();
      if (unit === null) {
        console.warn(
          `[shader-runtime] out of WebGL texture units; sampler "${name}" won't be bound`,
        );
        return;
      }
      const tex = gl.createTexture();
      if (!tex) {
        console.warn(`[shader-runtime] couldn't allocate texture for "${name}"`);
        return;
      }
      entry = { kind: "owned", unit, texture: tex, size: [1, 1] };
      this.samplerEntries.set(name, entry);
    }

    // Upload + apply hint-derived filter/wrap. NEAREST+CLAMP defaults
    // come from defaultTextureParams() so a sampler without explicit
    // hints still gets pixel-art-friendly sampling.
    const params = paramsFromHints(hints, gl);
    gl.activeTexture(gl.TEXTURE0 + entry.unit);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    applyTextureParams(gl, params);
    const w = "width" in source ? (source as { width: number }).width : 1;
    const h = "height" in source ? (source as { height: number }).height : 1;
    entry.size = [w, h];
  }

  private releaseSamplerEntry(name: string): void {
    const entry = this.samplerEntries.get(name);
    if (!entry) return;
    if (entry.kind === "owned") this.gl.deleteTexture(entry.texture);
    this.samplerEntries.delete(name);
  }

  private allocateTextureUnit(): number | null {
    const max = this.gl.getParameter(
      this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
    ) as number;
    const used = new Set<number>([0]); // 0 reserved for u_texture
    for (const e of this.samplerEntries.values()) {
      if (e.kind === "owned") used.add(e.unit);
    }
    for (let i = 1; i < max; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  /** Replace the bound texture for the sampler2D `u_texture` (which is
   *  what GDShader's `TEXTURE` built-in resolves to). Accepts any
   *  TexImageSource — HTMLImageElement is the typical caller.
   *
   *  Filter / wrap parameters come from `this.mainTextureParams`,
   *  which defaults to NEAREST+CLAMP but gets overridden when a
   *  screen-alias sampler declares filter_* / repeat_* hints (see
   *  setSamplerTextures). That lets `uniform sampler2D SCREEN_TEXTURE
   *  : hint_screen_texture, filter_linear;` produce smooth-warp
   *  sampling on the preview without the user having to swap NEAREST
   *  manually. */
  setMainTexture(source: TexImageSource): void {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    const tex = gl.createTexture();
    if (!tex) throw new Error("WebGL2: couldn't allocate texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    applyTextureParams(gl, this.mainTextureParams);
    this.texture = tex;
    const w = "width" in source ? (source as { width: number }).width : DEFAULT_TEXTURE_SIZE;
    const h = "height" in source ? (source as { height: number }).height : DEFAULT_TEXTURE_SIZE;
    this.textureSize = [w, h];
  }

  start(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.drawFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.stop();
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.fragmentShader) gl.deleteShader(this.fragmentShader);
    if (this.vertexShader) gl.deleteShader(this.vertexShader);
    if (this.passthroughProgram) gl.deleteProgram(this.passthroughProgram);
    if (this.texture) gl.deleteTexture(this.texture);
    for (const entry of this.samplerEntries.values()) {
      if (entry.kind === "owned") gl.deleteTexture(entry.texture);
    }
    this.samplerEntries.clear();
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    this.fboA = null;
    this.fboB = null;
    this.texA = null;
    this.texB = null;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    this.program = null;
    this.texture = null;
    this.destroyed = true;
  }

  /** Draw a single frame. Three passes, all targeting a ping-pong
   *  framebuffer (so user shaders can sample the previous frame via
   *  `hint_previous_frame`); a final blit lifts the result to the
   *  canvas.
   *
   *  PASS 1 — passthrough: draws the bound u_texture (user-picked image
   *  or the procedural UV grid) edge to edge, no blending. Establishes
   *  an opaque base that's visible whatever the user shader does.
   *
   *  PASS 2 — user shader: runs the compiled user GLSL with standard
   *  alpha blending. prev_frame samplers read from the OTHER FBO (last
   *  frame's output) so iterative effects (trails, decay) just work.
   *  blendFuncSeparate preserves the framebuffer alpha at 1.0 so the
   *  canvas presents opaque regardless of fragColor.a.
   *
   *  BLIT — passthrough again, this time sampling the front FBO's
   *  texture and rendering to the canvas. After the blit we swap
   *  front/back FBOs for the next frame.
   *
   *  Public so the React wrapper can force a re-render when a uniform
   *  changes outside the RAF loop (e.g. user drags a slider while
   *  paused). */
  drawFrame(): void {
    if (this.destroyed) return;
    const gl = this.gl;

    // Resize the drawing buffer to match the canvas's CSS size so the
    // preview stays sharp under DPR + responsive layouts.
    syncCanvasSize(this.canvas, gl);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    this.ensureFBOs(w, h);

    const frontFBO = this.frontIsA ? this.fboA : this.fboB;
    const frontTex = this.frontIsA ? this.texA : this.texB;
    const backTex = this.frontIsA ? this.texB : this.texA;
    if (!frontFBO || !frontTex || !backTex) return;

    // --- Bind ping-pong FBO as render target ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, frontFBO);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(this.vao);

    // Bind back-FBO texture to its reserved unit so prev_frame
    // samplers can read it. Apply hints from the FIRST prev_frame
    // sampler found (multi-entry conflicts: first wins — rare in
    // practice). Filter defaults to LINEAR for prev_frame since trails
    // almost always want smooth sampling; user can override with
    // filter_nearest.
    gl.activeTexture(gl.TEXTURE0 + this.prevFrameUnit);
    gl.bindTexture(gl.TEXTURE_2D, backTex);
    const prevFrameHints = this.firstPrevFrameHints();
    applyTextureParams(
      gl,
      prevFrameHints ? paramsFromHints(prevFrameHints, gl) : prevFrameDefaultParams(),
    );

    // Bind u_texture to TEXTURE0 for the base pass (and any TEXTURE /
    // screen-alias references in the user shader).
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // --- PASS 1: passthrough base ---
    gl.disable(gl.BLEND);
    gl.useProgram(this.passthroughProgram);
    if (this.passthroughSamplerLoc) gl.uniform1i(this.passthroughSamplerLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- PASS 2: user shader over the base ---
    if (this.program) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ZERO,
        gl.ONE,
      );
      gl.useProgram(this.program);

      // Built-in uniforms.
      this.bindFloat("u_time", (performance.now() - this.startTime) / 1000);
      this.bindVec2("u_resolution", w, h);
      this.bindVec2(
        "u_texture_pixel_size",
        1 / this.textureSize[0],
        1 / this.textureSize[1],
      );

      // u_texture → unit 0 (already bound above).
      const samplerLoc = this.getLocation("u_texture");
      if (samplerLoc) gl.uniform1i(samplerLoc, 0);

      // User sampler2D uniforms.
      for (const [name, entry] of this.samplerEntries) {
        const loc = this.getLocation(name);
        if (!loc) continue;
        if (entry.kind === "owned") {
          gl.activeTexture(gl.TEXTURE0 + entry.unit);
          gl.bindTexture(gl.TEXTURE_2D, entry.texture);
          gl.uniform1i(loc, entry.unit);
        } else if (entry.kind === "screen") {
          // Share u_texture's unit. u_texture's params already reflect
          // this sampler's filter/wrap hints (set at setMainTexture time).
          gl.uniform1i(loc, 0);
        } else {
          // prev_frame — back-FBO texture already bound to prevFrameUnit
          // at the top of drawFrame.
          gl.uniform1i(loc, this.prevFrameUnit);
        }
      }

      // User numeric uniforms.
      for (const [name, value] of this.uniformValues) {
        this.bindUniform(name, value);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
    }

    // --- BLIT: front FBO → canvas ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(this.passthroughProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frontTex);
    if (this.passthroughSamplerLoc) gl.uniform1i(this.passthroughSamplerLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);

    // Swap roles for next frame — the frame we just rendered becomes
    // the "previous frame" that next frame's user shader can sample.
    this.frontIsA = !this.frontIsA;
  }

  /** Allocate (or re-allocate on resize) the two ping-pong framebuffers
   *  + their color-attachment textures. Sized to match the current
   *  drawing buffer. Trails / iterative state is lost on resize —
   *  acceptable since resize is rare and the next frame rebuilds from
   *  the source. */
  private ensureFBOs(width: number, height: number): void {
    if (this.fboSize[0] === width && this.fboSize[1] === height && this.fboA) {
      return;
    }
    const gl = this.gl;
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    this.texA = createFBOTexture(gl, width, height);
    this.texB = createFBOTexture(gl, width, height);
    this.fboA = createFBOWithColor(gl, this.texA);
    this.fboB = createFBOWithColor(gl, this.texB);
    this.fboSize = [width, height];
  }

  /** First prev_frame sampler's hints, or null if none. Used to pick
   *  the back-FBO texture's filter/wrap params at draw time. */
  private firstPrevFrameHints(): UniformHint[] | null {
    for (const entry of this.samplerEntries.values()) {
      if (entry.kind === "prev_frame") return entry.hints;
    }
    return null;
  }

  private bindFloat(name: string, v: number): void {
    const loc = this.getLocation(name);
    if (loc) this.gl.uniform1f(loc, v);
  }

  private bindVec2(name: string, x: number, y: number): void {
    const loc = this.getLocation(name);
    if (loc) this.gl.uniform2f(loc, x, y);
  }

  private bindUniform(name: string, value: UniformValue): void {
    const loc = this.getLocation(name);
    if (!loc) return;
    const gl = this.gl;
    if (typeof value === "boolean") {
      gl.uniform1i(loc, value ? 1 : 0);
    } else if (typeof value === "number") {
      // Could be a float or an int uniform — WebGL is forgiving with
      // uniform1f vs uniform1i for samplers / ints when the shader
      // expects one, so we use uniform1f and accept the narrow loss
      // of int precision past ~16M (well past anything in a slider).
      gl.uniform1f(loc, value);
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 2:
          gl.uniform2f(loc, value[0]!, value[1]!);
          break;
        case 3:
          gl.uniform3f(loc, value[0]!, value[1]!, value[2]!);
          break;
        case 4:
          gl.uniform4f(loc, value[0]!, value[1]!, value[2]!, value[3]!);
          break;
        // Length 1 collapses to a float — supports the
        // "single-element array for consistency" case if the UI hands
        // it through; everything else we just skip.
        case 1:
          gl.uniform1f(loc, value[0]!);
          break;
      }
    }
  }

  private getLocation(name: string): WebGLUniformLocation | null {
    if (this.uniformLocations.has(name)) {
      return this.uniformLocations.get(name)!;
    }
    const loc = this.program ? this.gl.getUniformLocation(this.program, name) : null;
    this.uniformLocations.set(name, loc);
    return loc;
  }
}

// SamplerEntry — three flavors. "owned" carries its own WebGLTexture
// on a dedicated unit (1..N). "screen" routes to unit 0 (u_texture)
// at draw time. "prev_frame" routes to the reserved high unit (set
// once at construction) where the runtime binds the back ping-pong
// FBO's color texture each frame.
//
// Owned entries store their hints so we can reapply them per-frame
// (cheap; texParameteri is just state writes). prev_frame entries
// also store hints — applied to the back-FBO texture at bind time so
// `hint_previous_frame, filter_linear` gives smooth-sampled trails.
type SamplerEntry =
  | {
      kind: "owned";
      unit: number;
      texture: WebGLTexture;
      size: [number, number];
    }
  | { kind: "screen" }
  | { kind: "prev_frame"; hints: UniformHint[] };

interface TextureParams {
  minFilter: GLenum;
  magFilter: GLenum;
  wrapS: GLenum;
  wrapT: GLenum;
  generateMipmaps: boolean;
}

function defaultTextureParams(): TextureParams {
  // NEAREST + CLAMP for pixel-art-friendly sampling. WebGL2 enum
  // values are constants so we can hard-code the numeric form:
  // TEXTURE_MIN_FILTER NEAREST = 0x2600, etc. Using gl.* from a
  // context would require passing one through — overkill since
  // these never change.
  return {
    minFilter: 0x2600, // gl.NEAREST
    magFilter: 0x2600, // gl.NEAREST
    wrapS: 0x812f, // gl.CLAMP_TO_EDGE
    wrapT: 0x812f,
    generateMipmaps: false,
  };
}

function prevFrameDefaultParams(): TextureParams {
  // Trails / iterative effects almost always want LINEAR sampling —
  // sub-pixel drift produces clean smears rather than blocky steps.
  // Filter overridable via explicit hints (filter_nearest on a
  // hint_previous_frame sampler).
  return {
    minFilter: 0x2601, // gl.LINEAR
    magFilter: 0x2601,
    wrapS: 0x812f, // gl.CLAMP_TO_EDGE
    wrapT: 0x812f,
    generateMipmaps: false,
  };
}

function createFBOTexture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("WebGL2: couldn't allocate FBO texture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  // Default to LINEAR + CLAMP — overridden per-frame at bind time
  // when a prev_frame sampler has explicit filter/wrap hints.
  applyTextureParams(gl, prevFrameDefaultParams());
  return tex;
}

function createFBOWithColor(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("WebGL2: couldn't allocate FBO");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  // Restore default render target so callers don't accidentally render
  // into the FBO before they intend to.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

// Derives texture parameters from a uniform's hint list. Multiple
// filter / wrap hints: last one wins (Godot accepts both orderings;
// we don't try to deduplicate).
function paramsFromHints(
  hints: UniformHint[],
  gl: WebGL2RenderingContext,
): TextureParams {
  const p = defaultTextureParams();
  for (const h of hints) {
    switch (h.name) {
      case "filter_nearest":
        p.minFilter = gl.NEAREST;
        p.magFilter = gl.NEAREST;
        p.generateMipmaps = false;
        break;
      case "filter_linear":
        p.minFilter = gl.LINEAR;
        p.magFilter = gl.LINEAR;
        p.generateMipmaps = false;
        break;
      case "filter_nearest_mipmap":
        p.minFilter = gl.NEAREST_MIPMAP_NEAREST;
        p.magFilter = gl.NEAREST;
        p.generateMipmaps = true;
        break;
      case "filter_linear_mipmap":
        p.minFilter = gl.LINEAR_MIPMAP_LINEAR;
        p.magFilter = gl.LINEAR;
        p.generateMipmaps = true;
        break;
      case "repeat_enable":
        p.wrapS = gl.REPEAT;
        p.wrapT = gl.REPEAT;
        break;
      case "repeat_disable":
        p.wrapS = gl.CLAMP_TO_EDGE;
        p.wrapT = gl.CLAMP_TO_EDGE;
        break;
      // hint_screen_texture is handled at the routing level (see
      // setSamplerTextures); doesn't affect texture params per se.
    }
  }
  return p;
}

function applyTextureParams(
  gl: WebGL2RenderingContext,
  p: TextureParams,
): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, p.minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, p.magFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, p.wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, p.wrapT);
  if (p.generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
}

function texParamsEqual(a: TextureParams, b: TextureParams): boolean {
  return (
    a.minFilter === b.minFilter &&
    a.magFilter === b.magFilter &&
    a.wrapS === b.wrapS &&
    a.wrapT === b.wrapT &&
    a.generateMipmaps === b.generateMipmaps
  );
}

// setSamplerTextures accepts either a bare TexImageSource (back-compat
// with callers that don't care about hints), null (release), or an
// object carrying both source and hints. Normalize to the object form.
function normalizeSamplerInput(
  raw:
    | { source: TexImageSource | null; hints?: UniformHint[] }
    | TexImageSource
    | null,
): { source: TexImageSource | null; hints: UniformHint[] } | null {
  if (raw === null) return null;
  if (typeof raw === "object" && "source" in raw) {
    return { source: raw.source, hints: raw.hints ?? [] };
  }
  return { source: raw as TexImageSource, hints: [] };
}

// Compiles + links a known-good vert/frag pair, no error tolerance.
// Used for the always-on passthrough program; a failure here is a
// Bleepforge bug (the source is fixed) so we throw to fall back to the
// PreviewCanvas's "WebGL unavailable" error path.
function compileFixedProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram {
  const vert = gl.createShader(gl.VERTEX_SHADER);
  const frag = gl.createShader(gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  if (!vert || !frag || !prog) {
    throw new Error("WebGL2: couldn't allocate passthrough program");
  }
  gl.shaderSource(vert, vertSource);
  gl.compileShader(vert);
  if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(vert) ?? "(no log)";
    throw new Error(`passthrough vertex compile failed: ${log}`);
  }
  gl.shaderSource(frag, fragSource);
  gl.compileShader(frag);
  if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(frag) ?? "(no log)";
    throw new Error(`passthrough fragment compile failed: ${log}`);
  }
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "(no log)";
    throw new Error(`passthrough link failed: ${log}`);
  }
  // Shaders attached + linked; safe to detach + delete the per-stage
  // objects now (the program holds its own reference).
  gl.detachShader(prog, vert);
  gl.detachShader(prog, frag);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return prog;
}

// Default test texture — generated procedurally so we don't ship a
// binary asset. Produces a 64x64 checkerboard tinted by UV so shaders
// that ignore the bound texture still see something useful through
// `texture(TEXTURE, UV)`.
const DEFAULT_TEXTURE_SIZE = 64;

function createDefaultTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("WebGL2: couldn't allocate default texture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    DEFAULT_TEXTURE_SIZE,
    DEFAULT_TEXTURE_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    buildUvGridPixels(DEFAULT_TEXTURE_SIZE),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function buildUvGridPixels(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) === 0 ? 1.0 : 0.55;
      const u = x / (size - 1);
      const v = y / (size - 1);
      const idx = (y * size + x) * 4;
      pixels[idx] = Math.round(u * 255 * cell);
      pixels[idx + 1] = Math.round(v * 255 * cell);
      pixels[idx + 2] = Math.round(128 * cell);
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}

function syncCanvasSize(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const targetW = Math.max(1, Math.floor(cssW * dpr));
  const targetH = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    gl.viewport(0, 0, targetW, targetH);
  }
}

// GLSL compile error logs follow a rough convention:
//   "ERROR: 0:LINE: message"
//   "WARNING: 0:LINE: message"
// Drivers vary in capitalization + bracket styles; we accept whatever
// preserves the `0:NUMBER:` pattern. Anything else falls through as a
// best-effort whole-message error.
function parseGlslErrors(log: string, emit: EmitResult): CompileError[] {
  const errors: CompileError[] = [];
  const lineRe = /^(?:ERROR|WARNING)?:?\s*\d*:(\d+):\s*(.+?)\s*$/i;
  for (const line of log.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = lineRe.exec(trimmed);
    if (m) {
      const emittedLine = Number(m[1]);
      const message = m[2]!;
      errors.push({
        message,
        emittedLine,
        userLine: mapEmittedLineToUser(emittedLine, emit),
      });
    } else {
      errors.push({ message: trimmed, emittedLine: null, userLine: null });
    }
  }
  // If the parser missed entirely (no recognizable lines), surface the
  // raw log as a single fallback error so we don't lose information.
  if (errors.length === 0) {
    errors.push({ message: log.trim(), emittedLine: null, userLine: null });
  }
  return errors;
}
