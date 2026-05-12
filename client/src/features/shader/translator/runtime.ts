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

  /** Replace the bound texture for the sampler2D `u_texture` (which is
   *  what GDShader's `TEXTURE` built-in resolves to). Accepts any
   *  TexImageSource — HTMLImageElement is the typical caller. */
  setMainTexture(source: TexImageSource): void {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    const tex = gl.createTexture();
    if (!tex) throw new Error("WebGL2: couldn't allocate texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    // Pixel-art-friendly sampling: nearest neighbor, clamp to edge so
    // the user can see the texture extents on the preview quad.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    this.program = null;
    this.texture = null;
    this.destroyed = true;
  }

  /** Draw a single frame. Two passes:
   *
   *  PASS 1 — passthrough: draws the bound texture (user-picked image or
   *  the procedural UV grid) edge to edge, no blending. Establishes an
   *  opaque base that's visible whatever the user shader does.
   *
   *  PASS 2 — user shader: runs the compiled user GLSL with standard
   *  alpha blending. Shaders that write opaque fragColors fully replace
   *  the base; shaders that write low-alpha (like scanlines) composite
   *  over the base, dimming it instead of disappearing. blendFuncSeparate
   *  preserves the framebuffer alpha at 1.0 (canvas stays opaque even
   *  when the shader's a is 0) regardless of context-level alpha flag.
   *
   *  Public so the React wrapper can force a re-render when a uniform
   *  changes outside the RAF loop (e.g. user drags a slider while paused). */
  drawFrame(): void {
    if (this.destroyed) return;
    const gl = this.gl;

    // Resize the drawing buffer to match the canvas's CSS size so the
    // preview stays sharp under DPR + responsive layouts.
    syncCanvasSize(this.canvas, gl);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindVertexArray(this.vao);

    // Texture unit 0 is shared by both programs — bind once.
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
      // Standard alpha blending for RGB; preserve framebuffer alpha at
      // 1.0 so the canvas stays opaque against the page bg even when
      // the user shader writes alpha 0 everywhere.
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ZERO,
        gl.ONE,
      );
      gl.useProgram(this.program);

      // Built-in uniforms.
      this.bindFloat("u_time", (performance.now() - this.startTime) / 1000);
      this.bindVec2("u_resolution", gl.drawingBufferWidth, gl.drawingBufferHeight);
      this.bindVec2("u_texture_pixel_size", 1 / this.textureSize[0], 1 / this.textureSize[1]);

      // Sampler binding for TEXTURE → u_texture, reuses TEXTURE0.
      const samplerLoc = this.getLocation("u_texture");
      if (samplerLoc) gl.uniform1i(samplerLoc, 0);

      // User uniforms.
      for (const [name, value] of this.uniformValues) {
        this.bindUniform(name, value);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
    }

    gl.bindVertexArray(null);
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
