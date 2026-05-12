import { useEffect, useMemo, useState } from "react";

import { AssetPicker } from "../../components/AssetPicker";
import { assetUrl } from "../../lib/api";
import { PreviewCanvas } from "./PreviewCanvas";
import { UniformControls, uniformDefault } from "./UniformControls";
import type {
  CompileError,
  CompileResult,
  EmitResult,
  UniformDecl,
  UniformValue,
} from "./translator";

// Encapsulates the live-preview panel: canvas + test-image picker +
// auto-generated uniform controls + compile-error display. Keeps the
// Edit page lean — it only needs to feed parsed + emitted GLSL in and
// gets a self-managed preview out.
//
// State that belongs here (not Edit.tsx):
//   - uniformValues (per-uniform live values; defaults derived from
//     the parsed declarations, preserved across edits when the uniform
//     name + type don't change)
//   - texturePath + loaded HTMLImageElement (picked via AssetPicker;
//     reuses the same /api/asset endpoint the rest of the app uses)
//   - compileErrors (returned by the runtime; surfaced in a banner)

interface Props {
  emit: EmitResult | null;
  uniforms: UniformDecl[];
  /** Parser-level reason that emit is null. Lets us show a single
   *  unified error pane instead of a blank panel. */
  parseError: { reason: string; line: number | null } | null;
}

export function PreviewPane({ emit, uniforms, parseError }: Props) {
  const [uniformValues, setUniformValues] = useState<Record<string, UniformValue>>(
    () => buildDefaultValues(uniforms),
  );
  const [texturePath, setTexturePath] = useState<string>("");
  const [textureSource, setTextureSource] = useState<HTMLImageElement | null>(null);
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([]);

  // Preserve user-tweaked values across editor changes: when the parsed
  // uniform list changes shape, keep entries whose name + type still
  // match; reseed everything else from defaults. Effect runs whenever
  // the declarations change (not the values themselves).
  useEffect(() => {
    setUniformValues((prev) => mergeValues(prev, uniforms));
    // Intentionally only depends on the declarations array reference —
    // the parent should pass a fresh array when the source changes,
    // stable otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniforms]);

  // Load the user-picked image. assetUrl maps a Godot-side path to the
  // local /api/asset endpoint; same pattern as AssetThumb. Image is
  // released on path change.
  useEffect(() => {
    if (!texturePath) {
      setTextureSource(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setTextureSource(img);
    img.onerror = () => setTextureSource(null);
    img.src = assetUrl(texturePath);
    return () => {
      // Cancel any in-flight load if the path changes again before this
      // image finishes loading.
      img.onload = null;
      img.onerror = null;
    };
  }, [texturePath]);

  const handleCompileResult = (result: CompileResult) => {
    setCompileErrors(result.ok ? [] : result.errors);
  };

  const resetUniforms = () => setUniformValues(buildDefaultValues(uniforms));

  const errorBanner = useMemo(() => {
    if (parseError) {
      return (
        <ErrorBanner
          title="Live preview unsupported"
          subtitle={parseError.line ? `line ${parseError.line}` : undefined}
          message={parseError.reason}
        />
      );
    }
    if (compileErrors.length > 0) {
      return (
        <ErrorBanner
          title="Shader compile errors"
          message={
            <ul className="space-y-0.5">
              {compileErrors.map((e, i) => (
                <li key={i} className="font-mono text-[11px]">
                  {e.userLine !== null && (
                    <span className="text-amber-400">line {e.userLine}: </span>
                  )}
                  {e.message}
                </li>
              ))}
            </ul>
          }
        />
      );
    }
    return null;
  }, [parseError, compileErrors]);

  return (
    <section className="border-2 border-neutral-800 bg-neutral-950">
      <header className="flex items-center justify-between border-b-2 border-neutral-800 px-3 py-2">
        <h2 className="font-display text-xs uppercase tracking-wider text-neutral-300">
          Live preview
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
          v1 · canvas_item
        </span>
      </header>

      <div className="space-y-3 p-3">
        <PreviewCanvas
          emit={emit}
          uniformValues={uniformValues}
          mainTextureSource={textureSource}
          onCompileResult={handleCompileResult}
        />

        {errorBanner}

        <div className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            Test image
          </span>
          <AssetPicker
            path={texturePath}
            onChange={setTexturePath}
            placeholder="(uv-grid default)"
          />
        </div>

        <div className="border-t border-neutral-800/70 pt-3">
          <UniformControls
            uniforms={uniforms}
            values={uniformValues}
            onChange={(name, value) =>
              setUniformValues((prev) => ({ ...prev, [name]: value }))
            }
            onReset={uniforms.length > 0 ? resetUniforms : undefined}
          />
        </div>
      </div>
    </section>
  );
}

function buildDefaultValues(uniforms: UniformDecl[]): Record<string, UniformValue> {
  const out: Record<string, UniformValue> = {};
  for (const u of uniforms) out[u.name] = uniformDefault(u);
  return out;
}

// When the parsed uniform list shifts (user added/removed/renamed a
// uniform), we want to preserve user-tweaked values for uniforms whose
// name + type stayed the same. Anything new gets its default; anything
// removed is dropped.
function mergeValues(
  prev: Record<string, UniformValue>,
  uniforms: UniformDecl[],
): Record<string, UniformValue> {
  const out: Record<string, UniformValue> = {};
  for (const u of uniforms) {
    const existing = prev[u.name];
    if (existing !== undefined && isValueCompatibleWithType(existing, u.type)) {
      out[u.name] = existing;
    } else {
      out[u.name] = uniformDefault(u);
    }
  }
  return out;
}

function isValueCompatibleWithType(value: UniformValue, type: UniformDecl["type"]): boolean {
  if (type === "bool") return typeof value === "boolean";
  if (type === "int" || type === "float") return typeof value === "number";
  if (type === "vec2") return Array.isArray(value) && value.length === 2;
  if (type === "vec3") return Array.isArray(value) && value.length === 3;
  if (type === "vec4") return Array.isArray(value) && value.length === 4;
  return false;
}

interface ErrorBannerProps {
  title: string;
  subtitle?: string;
  message: React.ReactNode;
}

function ErrorBanner({ title, subtitle, message }: ErrorBannerProps) {
  return (
    <div className="border-2 border-red-700 bg-red-950/40 px-3 py-2 text-red-200">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-red-300">
        <span>{title}</span>
        {subtitle && <span className="text-red-400/80">{subtitle}</span>}
      </div>
      <div className="mt-1 text-xs leading-relaxed">{message}</div>
    </div>
  );
}
