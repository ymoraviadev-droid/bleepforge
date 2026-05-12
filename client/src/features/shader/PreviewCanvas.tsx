import { useEffect, useRef } from "react";

import type {
  CompileResult,
  EmitResult,
  UniformHint,
  UniformValue,
} from "./translator";
import { ShaderRuntime } from "./translator";

/** Per-sampler binding passed to PreviewCanvas. Source is the loaded
 *  image (or null = release the entry); hints carry the uniform's
 *  declaration-time annotations (filter_*, repeat_*, hint_screen_texture)
 *  so the runtime can apply them at upload time. */
export interface SamplerBinding {
  source: TexImageSource | null;
  hints?: UniformHint[];
}

// React wrapper around the WebGL2 ShaderRuntime. Owns the canvas + the
// runtime instance, recompiles when the emit prop changes, pushes
// uniform values + the main texture through on prop changes. Tear-down
// is explicit on unmount so the GL context releases — the browser caps
// concurrent WebGL contexts at 8-16 per page and we'd otherwise leak
// one per edit-page mount.

interface Props {
  /** Emitted GLSL + source map. Null while parsing fails — caller shows
   *  a fallback pane. */
  emit: EmitResult | null;
  /** User uniform values keyed by uniform name. Pushed through on every
   *  change; the runtime samples them every frame so React re-renders
   *  aren't on the critical path for slider drags. */
  uniformValues: Record<string, UniformValue>;
  /** Optional main-texture source (HTMLImageElement loaded from the
   *  user's AssetPicker pick). Null → runtime keeps its built-in UV-grid
   *  default. */
  mainTextureSource: TexImageSource | null;
  /** Per-user-sampler bindings keyed by uniform name. Each entry
   *  carries the loaded image source (or null = release) AND the
   *  uniform's hints (filter_*, repeat_*, hint_screen_texture). Full
   *  reconciliation — entries absent from the dict get released. */
  samplerSources: Record<string, SamplerBinding>;
  /** Called with the result of every compile so the edit page can
   *  surface errors / clear the error banner on success. */
  onCompileResult?: (result: CompileResult) => void;
}

export function PreviewCanvas({
  emit,
  uniformValues,
  mainTextureSource,
  samplerSources,
  onCompileResult,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<ShaderRuntime | null>(null);
  // onCompileResult is plumbed via a ref so a parent that doesn't
  // memoize the callback doesn't trigger a recompile every render.
  const onCompileResultRef = useRef(onCompileResult);
  onCompileResultRef.current = onCompileResult;

  // Mount the runtime once. Recreating on every emit change would lose
  // the texture state (and the GL context churn would be wasteful).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let runtime: ShaderRuntime;
    try {
      runtime = new ShaderRuntime(c);
    } catch (err) {
      // WebGL2 might be unavailable — surface as a compile-style error
      // so the edit page can show it in the same error pane as user
      // shader errors. Cleaner UX than throwing and tripping the boundary.
      onCompileResultRef.current?.({
        ok: false,
        errors: [
          {
            message: (err as Error).message,
            userLine: null,
            emittedLine: null,
          },
        ],
      });
      return;
    }
    runtimeRef.current = runtime;
    runtime.start();
    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, []);

  // Compile on emit prop change. A null emit (translator parse failure)
  // leaves the previous program in place — the user keeps seeing the
  // last good render while they fix the error.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !emit) return;
    const result = runtime.compile(emit);
    onCompileResultRef.current?.(result);
  }, [emit]);

  // Main-texture swap. Each load is one-shot; runtime keeps the GL
  // texture object alive across frames.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !mainTextureSource) return;
    try {
      runtime.setMainTexture(mainTextureSource);
    } catch (err) {
      console.warn("[shader-preview] setMainTexture failed:", err);
    }
  }, [mainTextureSource]);

  // User-sampler textures. Full reconciliation on every change — the
  // runtime releases entries no longer in the dict and uploads / replaces
  // entries that are. Keeps the GL state authoritative against the React
  // state without diff tracking on this side.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      runtime.setSamplerTextures(samplerSources);
    } catch (err) {
      console.warn("[shader-preview] setSamplerTextures failed:", err);
    }
  }, [samplerSources]);

  // Push uniform values. The runtime stores them in a Map and reads on
  // every drawFrame, so this effect is just "stash the latest values"
  // rather than "force a redraw."
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    for (const [name, value] of Object.entries(uniformValues)) {
      runtime.setUniformValue(name, value);
    }
  }, [uniformValues]);

  return (
    <div
      className="relative w-full overflow-hidden border-2 border-neutral-800 bg-black"
      style={{ aspectRatio: "1 / 1" }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
