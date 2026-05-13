import { useEffect, useMemo, useState } from "react";

import { AssetPicker } from "../../components/AssetPicker";
import { assetUrl } from "../../lib/api";
import { PreviewCanvas, type SamplerBinding } from "./PreviewCanvas";
import { UniformControls, uniformDefault } from "./UniformControls";
import type {
  CompileError,
  CompileResult,
  EmitResult,
  UniformDecl,
  UniformValue,
} from "./translator";

// Live-preview tab content. Big canvas centered at the top, with a
// toolbar above (aspect ratio + pause/play + time scrub + reset) and
// controls below (test image picker + uniform controls). The canvas
// max-width is capped at max-w-3xl (768px) so on a wide monitor the
// preview stays readable instead of stretching into a billboard —
// shader fragments are usually authored against a small viewport, not
// a 4K canvas.
//
// State that belongs here (not Edit.tsx):
//   - uniformValues (per-uniform live values for numeric uniforms;
//     defaults derived from the parsed declarations, preserved across
//     edits when the uniform name + type don't change)
//   - samplerPaths + samplerSources (per-uniform image bindings for
//     user-declared sampler2D uniforms; same preservation rule)
//   - texturePath + loaded HTMLImageElement (picked via AssetPicker
//     for the built-in TEXTURE / u_texture)
//   - compileErrors (returned by the runtime; surfaced in a banner)
//   - aspectRatio + timeMode + manualTime (preview-only display state;
//     persisted to localStorage so the user's last pick survives a
//     reload)

interface Props {
  emit: EmitResult | null;
  uniforms: UniformDecl[];
  /** Parser-level reason that emit is null. Lets us show a single
   *  unified error pane instead of a blank panel. */
  parseError: { reason: string; line: number | null } | null;
  /** Latest WebGL compile errors (or empty when clean). Lifted to the
   *  edit page so the same list drives both this pane's red banner
   *  AND the CodeMirror gutter markers — single source of truth. */
  compileErrors: CompileError[];
  /** Called when the PreviewCanvas finishes a compile, success or
   *  failure. The edit page uses this to update its compileErrors
   *  state. */
  onCompileResult: (result: CompileResult) => void;
}

const ASPECT_OPTIONS: { id: AspectId; label: string; ratio: string }[] = [
  { id: "1:1", label: "1:1", ratio: "1 / 1" },
  { id: "16:9", label: "16:9", ratio: "16 / 9" },
  { id: "4:3", label: "4:3", ratio: "4 / 3" },
  { id: "21:9", label: "21:9", ratio: "21 / 9" },
];
type AspectId = "1:1" | "16:9" | "4:3" | "21:9";

const ASPECT_KEY = "bleepforge:shaderPreviewAspect";
const DEFAULT_ASPECT: AspectId = "16:9";

function readSavedAspect(): AspectId {
  if (typeof window === "undefined") return DEFAULT_ASPECT;
  try {
    const raw = window.localStorage.getItem(ASPECT_KEY);
    if (raw && ASPECT_OPTIONS.some((o) => o.id === raw)) {
      return raw as AspectId;
    }
  } catch {}
  return DEFAULT_ASPECT;
}

const MAX_SCRUB_SECONDS = 60;

export function PreviewPane({
  emit,
  uniforms,
  parseError,
  compileErrors,
  onCompileResult,
}: Props) {
  const [uniformValues, setUniformValues] = useState<Record<string, UniformValue>>(
    () => buildDefaultValues(uniforms),
  );
  const [samplerPaths, setSamplerPaths] = useState<Record<string, string>>(() =>
    buildSamplerPaths(uniforms),
  );
  const [samplerSources, setSamplerSources] = useState<
    Record<string, HTMLImageElement | null>
  >({});
  const [texturePath, setTexturePath] = useState<string>("");
  const [textureSource, setTextureSource] = useState<HTMLImageElement | null>(null);

  // Aspect ratio is persisted per-app (not per-shader) — the user's
  // monitor and game viewport stay the same regardless of which shader
  // they're editing, so a global preference makes sense.
  const [aspectId, setAspectIdState] = useState<AspectId>(() => readSavedAspect());
  const setAspectId = (id: AspectId) => {
    setAspectIdState(id);
    try {
      window.localStorage.setItem(ASPECT_KEY, id);
    } catch {}
  };
  const aspect = ASPECT_OPTIONS.find((o) => o.id === aspectId) ?? ASPECT_OPTIONS[1]!;

  // Time control: PLAYING auto-advances u_time from real elapsed; PAUSED
  // freezes it at manualTime, which the slider edits. Pause-then-scrub
  // is the canonical workflow for inspecting time-based effects (decay,
  // trails, animated patterns) at a specific moment.
  const [timeMode, setTimeMode] = useState<"playing" | "paused">("playing");
  const [manualTime, setManualTime] = useState<number>(0);
  // Live time the runtime reports on every frame. While playing this
  // updates ~60Hz; while paused it stays equal to manualTime. The
  // display reads from here so it stays accurate without React owning
  // the animation loop.
  const [liveTime, setLiveTime] = useState<number>(0);

  // Preserve user-tweaked values across editor changes: when the parsed
  // uniform list changes shape, keep entries whose name + type still
  // match; reseed everything else from defaults. Effect runs whenever
  // the declarations change (not the values themselves). Sampler paths
  // get the same treatment on a parallel channel.
  useEffect(() => {
    setUniformValues((prev) => mergeValues(prev, uniforms));
    setSamplerPaths((prev) => mergeSamplerPaths(prev, uniforms));
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

  // Per-sampler image loading. One <img> request per active path; the
  // sampler-sources dict updates as each finishes. Sampler entries
  // disappear from samplerPaths when the user removes the uniform from
  // source — this effect prunes the matching source too so the runtime
  // releases the GL texture on the next setSamplerTextures call.
  useEffect(() => {
    const cancels: (() => void)[] = [];
    // Drop sources whose path was cleared or whose uniform disappeared.
    setSamplerSources((prev) => {
      const next: Record<string, HTMLImageElement | null> = {};
      for (const name of Object.keys(samplerPaths)) {
        if (samplerPaths[name]) next[name] = prev[name] ?? null;
        else next[name] = null;
      }
      return next;
    });
    // Kick off loads for any non-empty paths.
    for (const [name, path] of Object.entries(samplerPaths)) {
      if (!path) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () =>
        setSamplerSources((prev) => ({ ...prev, [name]: img }));
      img.onerror = () =>
        setSamplerSources((prev) => ({ ...prev, [name]: null }));
      img.src = assetUrl(path);
      cancels.push(() => {
        img.onload = null;
        img.onerror = null;
      });
    }
    return () => {
      for (const c of cancels) c();
    };
  }, [samplerPaths]);

  // Combine samplerSources (image elements) with each uniform's
  // declaration-time hints into the binding shape PreviewCanvas /
  // ShaderRuntime expect. Memoized on (samplerSources, uniforms) so
  // the runtime effect only re-fires when something actually changed.
  // Includes screen-texture-aliased samplers even though they have no
  // source — the runtime needs to see them present in the record so
  // it can wire their uniform locations to texture unit 0.
  const samplerBindings = useMemo<Record<string, SamplerBinding>>(() => {
    const out: Record<string, SamplerBinding> = {};
    for (const u of uniforms) {
      if (u.type !== "sampler2D") continue;
      out[u.name] = {
        source: samplerSources[u.name] ?? null,
        hints: u.samplerHints,
      };
    }
    return out;
  }, [samplerSources, uniforms]);

  const resetUniforms = () => setUniformValues(buildDefaultValues(uniforms));

  const togglePause = () => {
    if (timeMode === "playing") {
      // Snapshot the live time into the manual slider before pausing,
      // so the scrub starts at where the user was.
      setManualTime(liveTime);
      setTimeMode("paused");
    } else {
      setTimeMode("playing");
    }
  };

  const resetTime = () => {
    setManualTime(0);
    // Stay in whichever mode the user was in — pausing at zero is a
    // valid "rewind" gesture, resuming from zero is just "restart."
    if (timeMode === "playing") {
      // Hack: a re-enter into playing mode re-anchors startTime, which
      // happens naturally if we briefly toggle. Simpler: switch through
      // paused→playing in the same tick. Effect order means runtime
      // gets setManualTime(0) first, then resumeTime — clock starts at 0.
      setTimeMode("paused");
      // queueMicrotask makes sure both state updates land before the
      // useEffect-batched runtime calls run.
      queueMicrotask(() => setTimeMode("playing"));
    }
  };

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
    <div className="space-y-4">
      {/* Toolbar — aspect ratio chips on the left, time controls on the
          right. Wraps to two rows on narrow viewports. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-neutral-800 bg-neutral-950 px-3 py-2">
        <AspectRatioPicker value={aspectId} onChange={setAspectId} />
        <TimeControls
          mode={timeMode}
          liveTime={liveTime}
          manualTime={manualTime}
          onTogglePause={togglePause}
          onScrub={(s) => {
            setManualTime(s);
            if (timeMode === "playing") setTimeMode("paused");
          }}
          onReset={resetTime}
        />
      </div>

      <PreviewCanvas
        emit={emit}
        uniformValues={uniformValues}
        mainTextureSource={textureSource}
        samplerSources={samplerBindings}
        onCompileResult={onCompileResult}
        aspectRatio={aspect.ratio}
        timeMode={timeMode}
        manualTime={manualTime}
        onTimeTick={setLiveTime}
      />

      {errorBanner}

      <section className="border-2 border-neutral-800 bg-neutral-950">
        <header className="border-b-2 border-neutral-800 px-3 py-2">
          <h2 className="font-display text-xs uppercase tracking-wider text-neutral-300">
            Test image (TEXTURE / SCREEN_TEXTURE)
          </h2>
        </header>
        <div className="p-3">
          <AssetPicker
            path={texturePath}
            onChange={setTexturePath}
            placeholder="(uv-grid default)"
          />
        </div>
      </section>

      <section className="border-2 border-neutral-800 bg-neutral-950">
        <header className="border-b-2 border-neutral-800 px-3 py-2">
          <h2 className="font-display text-xs uppercase tracking-wider text-neutral-300">
            Uniforms
          </h2>
        </header>
        <div className="p-3">
          <UniformControls
            uniforms={uniforms}
            values={uniformValues}
            onChange={(name, value) =>
              setUniformValues((prev) => ({ ...prev, [name]: value }))
            }
            samplerValues={samplerPaths}
            onSamplerChange={(name, path) =>
              setSamplerPaths((prev) => ({ ...prev, [name]: path }))
            }
            onReset={uniforms.length > 0 ? resetUniforms : undefined}
          />
        </div>
      </section>
    </div>
  );
}

function AspectRatioPicker({
  value,
  onChange,
}: {
  value: AspectId;
  onChange: (id: AspectId) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        Aspect
      </span>
      <div className="flex">
        {ASPECT_OPTIONS.map((o, i) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`border-y-2 border-r-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                i === 0 ? "border-l-2" : ""
              } ${
                active
                  ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
              }`}
              aria-pressed={active}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeControls({
  mode,
  liveTime,
  manualTime,
  onTogglePause,
  onScrub,
  onReset,
}: {
  mode: "playing" | "paused";
  liveTime: number;
  manualTime: number;
  onTogglePause: () => void;
  onScrub: (seconds: number) => void;
  onReset: () => void;
}) {
  // While playing, show the live (runtime-polled) time; while paused,
  // show the manual slider value. Both formatted to one decimal for a
  // calm cadence — finer precision is jittery to read at 60Hz.
  const displayTime = mode === "playing" ? liveTime : manualTime;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onTogglePause}
        className="border-2 border-neutral-800 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-200 transition-colors hover:border-emerald-700 hover:text-emerald-300"
        title={mode === "playing" ? "Pause time (Space)" : "Resume time (Space)"}
        aria-label={mode === "playing" ? "Pause time" : "Resume time"}
      >
        {mode === "playing" ? "⏸ Pause" : "▶ Play"}
      </button>
      <span
        className="min-w-18 border-2 border-neutral-800 bg-neutral-950 px-2 py-1 text-right font-mono text-[10px] tabular-nums text-neutral-300"
        title={`u_time = ${displayTime.toFixed(3)}s`}
      >
        {displayTime.toFixed(1)}s
      </span>
      <input
        type="range"
        min={0}
        max={MAX_SCRUB_SECONDS}
        step={0.05}
        value={Math.min(displayTime, MAX_SCRUB_SECONDS)}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="h-1 w-32 cursor-pointer accent-emerald-500"
        aria-label="Scrub time"
        title="Drag to scrub u_time (implicitly pauses)"
      />
      <button
        type="button"
        onClick={onReset}
        className="border-2 border-neutral-800 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
        title="Reset u_time to 0"
        aria-label="Reset time"
      >
        ↺ 0
      </button>
    </div>
  );
}

// Sampler uniforms are tracked on a separate channel (samplerPaths /
// samplerSources), so we exclude them from the numeric-values dict —
// otherwise we'd be storing meaningless zero entries that bindUniform
// would try (and fail) to push as floats to a sampler location.
function buildDefaultValues(uniforms: UniformDecl[]): Record<string, UniformValue> {
  const out: Record<string, UniformValue> = {};
  for (const u of uniforms) {
    if (u.type === "sampler2D") continue;
    out[u.name] = uniformDefault(u);
  }
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
    if (u.type === "sampler2D") continue;
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

// Parallel-channel handling for sampler uniforms. Each entry is a path
// the user has picked via AssetPicker; the empty string means "no
// image yet — sampler stays unbound on the runtime side". Preserves
// picks across edits same as mergeValues does for numeric uniforms.
function buildSamplerPaths(uniforms: UniformDecl[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const u of uniforms) {
    if (u.type === "sampler2D") out[u.name] = "";
  }
  return out;
}

function mergeSamplerPaths(
  prev: Record<string, string>,
  uniforms: UniformDecl[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const u of uniforms) {
    if (u.type !== "sampler2D") continue;
    out[u.name] = prev[u.name] ?? "";
  }
  return out;
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
