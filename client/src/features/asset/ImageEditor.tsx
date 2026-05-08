import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../../components/Button";
import { showConfirm } from "../../components/Modal";
import { SliderField } from "../../components/SliderField";
import { assetsApi, assetUrl } from "../../lib/api";
import { fieldLabel, textInput } from "../../styles/classes";
import { CropCanvas } from "./CropCanvas";
import { CropControls } from "./CropControls";
import { type CropRect } from "./cropMath";
import { FolderPicker } from "./FolderPicker";
import {
  applyTint,
  autoTrim,
  blobToCanvas,
  canvasToPngBase64,
  detectSubjectBoundsAtClick,
  flipHorizontal,
  flipVertical,
  imageToCanvas,
  parseHexColor,
  removeBackground,
  rgbToHex,
  sampleColor,
  snapshotCanvas,
  type BgRemoveMode,
  type RGB,
} from "./imageOps";
import { pushToast } from "../../components/Toast";

// Three sampler modes share the canvas's single onSamplePixel hook.
// Mutually exclusive: activating one deactivates the others. Click on
// the image while a mode is active dispatches to the matching handler;
// no mode → clicks fall through to crop drag/move/handle.
type SamplerMode = "none" | "bg-color" | "magic-crop";

// Three modes share the same modal:
//   - import:    fresh source from disk → folder picker + filename → save as new
//   - edit:      load existing asset → save back to same path (overwrite)
//   - duplicate: load existing asset → same folder, new filename → save as new
//
// Destructive ops (flip, bg-remove, auto-trim) mutate `working` and push
// the previous state onto an undo stack. Live ops (crop, tint) are
// applied at save time so the user can tweak them without rebuilding
// the canvas. `display` = working + tint, recomputed when either
// changes — that's what CropCanvas renders. The eyedropper hook samples
// from `working` so the user picks pre-tint colors (which is what they
// mean when they say "remove the bg").

export type EditorMode =
  | { kind: "import" }
  | { kind: "edit"; assetPath: string }
  | { kind: "duplicate"; assetPath: string };

interface Props {
  mode: EditorMode;
  onClose: () => void;
  /** Called after a successful save with the absolute path of the file
   *  that landed on disk. Pickers use this to pick the new file. */
  onSaved: (path: string) => void;
}

interface SourceMeta {
  /** Filename suggestion (with extension). */
  suggestedName: string;
  /** Original on-disk path, or null for fresh imports. */
  originalPath: string | null;
  /** Original filesize in bytes (for the source summary). */
  originalSize: number | null;
}

export function ImageEditor({ mode, onClose, onSaved }: Props) {
  // --- Source / working canvas ---
  const [working, setWorking] = useState<HTMLCanvasElement | null>(null);
  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<HTMLCanvasElement[]>([]);
  const [, forceUndoTick] = useState(0);
  const refreshUndo = () => forceUndoTick((n) => n + 1);
  const [meta, setMeta] = useState<SourceMeta | null>(null);

  // --- Live ops (applied at render & save time) ---
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [snap, setSnap] = useState(1);
  const [tintColor, setTintColor] = useState<string>("#ffffff");
  const [tintPower, setTintPower] = useState<number>(0);
  const [tintAlpha, setTintAlpha] = useState<number>(1);
  const [tintBgFill, setTintBgFill] = useState<number>(0);

  // --- Sampler state (one of: none / bg-color eyedropper / magic-crop) ---
  const [samplerMode, setSamplerMode] = useState<SamplerMode>("none");
  const [bgSample, setBgSample] = useState<RGB | null>(null);
  const [bgSampleStart, setBgSampleStart] = useState<{ x: number; y: number } | null>(null);
  const [bgMode, setBgMode] = useState<BgRemoveMode>("connected");
  const [bgTolerance, setBgTolerance] = useState(8);

  // --- Destination ---
  const [targetDir, setTargetDir] = useState<string | null>(null);
  const [filename, setFilename] = useState("");

  // --- Status ---
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ML bg-removal state ---
  // First-call download is ~44MB (isnet_fp16 model) cached to the
  // browser's CacheStorage; subsequent calls skip the fetch step. The
  // progress callback emits (key, current, total) where key tags the
  // phase (`fetch:model`, `compute:inference`, …). We surface key + %
  // in the panel so the user understands a long first-call wait.
  const [mlBusy, setMlBusy] = useState(false);
  const [mlProgress, setMlProgress] = useState<{
    key: string;
    ratio: number;
  } | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);

  // --- Source preload for edit / duplicate ---
  useEffect(() => {
    if (mode.kind === "import") return;
    let cancelled = false;
    setError(null);
    const url = assetUrl(mode.assetPath);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img
      .decode()
      .then(async () => {
        if (cancelled) return;
        const canvas = imageToCanvas(img, img.naturalWidth, img.naturalHeight);
        originalRef.current = snapshotCanvas(canvas);
        setWorking(canvas);
        const baseName = mode.assetPath.split("/").pop() ?? "image.png";
        const suggested =
          mode.kind === "duplicate"
            ? withSuffix(baseName, "-copy")
            : baseName;
        setMeta({
          suggestedName: suggested,
          originalPath: mode.assetPath,
          originalSize: null,
        });
        setFilename(suggested);
        // For duplicate, default the folder to the existing file's dir.
        if (mode.kind === "duplicate") {
          const dir = mode.assetPath.slice(0, mode.assetPath.lastIndexOf("/"));
          setTargetDir(dir);
        } else {
          // Edit: target dir is the existing dir; filename matches; save
          // overwrites. No folder picker shown in the UI but we still
          // need targetDir for the API call.
          const dir = mode.assetPath.slice(0, mode.assetPath.lastIndexOf("/"));
          setTargetDir(dir);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`Failed to load: ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // --- Display canvas: working + tint (live preview of the tint sliders) ---
  const display = useMemo<HTMLCanvasElement | null>(() => {
    if (!working) return null;
    const tint = parseHexColor(tintColor);
    if (!tint) return working;
    const tintIsNoOp =
      tintPower <= 0 && tintAlpha >= 1 && tintBgFill <= 0;
    if (tintIsNoOp) return working;
    const out = snapshotCanvas(working);
    applyTint(out, tint, tintPower, tintAlpha, tintBgFill);
    return out;
  }, [working, tintColor, tintPower, tintAlpha, tintBgFill]);

  // --- Esc closes (unless we're saving) ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // --- File picking (import mode only) ---
  const acceptFile = async (file: File) => {
    setError(null);
    if (
      !file.type.startsWith("image/") &&
      !file.name.match(/\.(png|jpg|jpeg|webp|gif|svg|bmp)$/i)
    ) {
      setError(`Not a supported image: ${file.name}`);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch (err) {
      URL.revokeObjectURL(url);
      setError(`Failed to decode image: ${(err as Error).message}`);
      return;
    }
    const canvas = imageToCanvas(image, image.naturalWidth, image.naturalHeight);
    URL.revokeObjectURL(url);
    originalRef.current = snapshotCanvas(canvas);
    undoStackRef.current = [];
    setWorking(canvas);
    const stem = file.name.replace(/\.[^.]+$/, "");
    const suggested = `${stem}.png`;
    setMeta({
      suggestedName: suggested,
      originalPath: null,
      originalSize: file.size,
    });
    setFilename(suggested);
    setCrop(null);
    setBgSample(null);
    setBgSampleStart(null);
    setSamplerMode("none");
    setTintPower(0);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void acceptFile(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void acceptFile(f);
  };

  // --- Op application: snapshot → mutate → swap reference (so display
  //     useMemo re-runs on identity change) ---
  const applyDestructive = (op: (canvas: HTMLCanvasElement) => void) => {
    if (!working) return;
    undoStackRef.current.push(snapshotCanvas(working));
    if (undoStackRef.current.length > 24) {
      // Cap the stack — pixel-art canvases are small but this is a
      // browser tab, no point holding hundreds of snapshots.
      undoStackRef.current.shift();
    }
    refreshUndo();
    op(working);
    // Replace with a fresh same-content canvas so React + useMemo see a
    // new identity. Cheap (microseconds for typical pixel-art sizes).
    setWorking(snapshotCanvas(working));
  };

  const handleFlipH = () => applyDestructive(flipHorizontal);
  const handleFlipV = () => applyDestructive(flipVertical);

  const handleAutoTrim = () => {
    if (!working) return;
    applyDestructive((c) => {
      autoTrim(c);
    });
    // Auto-trim resizes the canvas; clear any active crop since its
    // coords are no longer valid for the new bounds.
    setCrop(null);
  };

  // Single click handler the canvas calls via onSamplePixel. We dispatch
  // based on which sampler mode is active — bg-color sets the bg sample,
  // magic-crop runs the click-seeded subject detector and sets the crop.
  // Mode auto-deactivates after a successful sample (one-shot behavior).
  const handlePixelClick = (x: number, y: number) => {
    if (!working) return;
    if (samplerMode === "bg-color") {
      const c = sampleColor(working, x, y);
      if (!c) return;
      setBgSample({ r: c.r, g: c.g, b: c.b });
      setBgSampleStart({ x, y });
      setSamplerMode("none");
      return;
    }
    if (samplerMode === "magic-crop") {
      const bounds = detectSubjectBoundsAtClick(working, x, y);
      setSamplerMode("none");
      if (!bounds) {
        pushToast({
          id: "magic-crop-no-subject",
          variant: "warn",
          title: "Couldn't detect subject",
          body: "The image looks uniform — try cropping manually.",
        });
        return;
      }
      // setCrop with non-null bounds also auto-ticks the "Enable crop"
      // checkbox in CropControls (it reads `enabled = crop !== null`),
      // so the user gets a fully visible, draggable crop in one click —
      // no Enable-crop-first step needed.
      setCrop(bounds);
    }
  };

  const handleApplyBgRemove = () => {
    if (!working || !bgSample) return;
    applyDestructive((c) => {
      removeBackground(c, {
        target: bgSample,
        tolerance: bgTolerance,
        mode: bgMode,
        startX: bgSampleStart?.x,
        startY: bgSampleStart?.y,
      });
    });
  };

  // ML bg removal — for photographic / non-pixel-art sources where the
  // perimeter heuristic falls down. Runs the BRIA RMBG model in a Web
  // Worker (proxyToWorker is the lib's default; keeps the UI responsive
  // during inference). Result is a PNG Blob with the bg's alpha zeroed
  // out — we decode that into a fresh canvas, push the previous working
  // state to the undo stack, and swap the new canvas in. Lazy-imports
  // the lib so the editor's first paint doesn't pay the load cost.
  const handleMlBgRemove = async () => {
    if (!working) return;
    setMlBusy(true);
    setMlError(null);
    setMlProgress(null);
    try {
      const { removeBackground: mlRemoveBg } = await import(
        "@imgly/background-removal"
      );
      const ctx = working.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      const imageData = ctx.getImageData(0, 0, working.width, working.height);
      const resultBlob = await mlRemoveBg(imageData, {
        model: "isnet_fp16",
        output: { format: "image/png" },
        progress: (key, current, total) => {
          const ratio = total > 0 ? current / total : 0;
          setMlProgress({ key, ratio });
        },
      });
      const newCanvas = await blobToCanvas(resultBlob);
      // Same snapshot-then-swap dance as applyDestructive, but we have
      // the fully-formed result canvas already, so we don't go through
      // the in-place mutation path.
      undoStackRef.current.push(snapshotCanvas(working));
      if (undoStackRef.current.length > 24) undoStackRef.current.shift();
      refreshUndo();
      setWorking(newCanvas);
    } catch (err) {
      setMlError((err as Error).message);
    } finally {
      setMlBusy(false);
      setMlProgress(null);
    }
  };

  const handleUndo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    setWorking(prev);
    refreshUndo();
  };

  // Per-section resets — used by the ↺ icons in each section header.
  // These reset only the live settings, NOT the destructive ops in the
  // working canvas. To revert a destructive op (Flip, Apply bg-remove,
  // Auto-trim) the user uses Undo. The Transform section's full Reset
  // button still wipes everything (settings + working canvas).
  const resetCrop = () => {
    setCrop(null);
    setSnap(1);
    if (samplerMode === "magic-crop") setSamplerMode("none");
  };

  const resetBackground = () => {
    setBgSample(null);
    setBgSampleStart(null);
    setBgTolerance(8);
    setBgMode("connected");
    if (samplerMode === "bg-color") setSamplerMode("none");
  };

  const resetTint = () => {
    setTintColor("#ffffff");
    setTintPower(0);
    setTintAlpha(1);
    setTintBgFill(0);
  };

  const handleReset = () => {
    if (!originalRef.current) return;
    undoStackRef.current = [];
    refreshUndo();
    setWorking(snapshotCanvas(originalRef.current));
    setCrop(null);
    setBgSample(null);
    setBgSampleStart(null);
    setSamplerMode("none");
    setTintPower(0);
  };

  // --- Save flow ---
  const handleSave = async (overwrite = false) => {
    if (!working || !targetDir || !filename) {
      setError("Pick a file, destination, and filename first.");
      return;
    }
    if (filename.includes("/") || filename.includes("\\")) {
      setError("Filename must not contain slashes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Build the output canvas from the live pipeline:
      //   working → tint → crop
      const out = snapshotCanvas(working);
      const tint = parseHexColor(tintColor);
      if (tint) applyTint(out, tint, tintPower, tintAlpha, tintBgFill);
      const finalCanvas = crop ? extractCropToCanvas(out, crop) : out;
      const contentBase64 = canvasToPngBase64(finalCanvas);
      // Edit mode always overwrites since the destination is the same path.
      const effectiveOverwrite = mode.kind === "edit" || overwrite;
      const result = await assetsApi.importImage({
        targetDir,
        filename,
        contentBase64,
        overwrite: effectiveOverwrite,
      });
      onSaved(result.path);
      onClose();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes(" 409 ")) {
        const ok = await showConfirm({
          title: "File exists",
          message: `${filename} already exists in this folder. Overwrite?`,
          confirmLabel: "Overwrite",
          danger: true,
        });
        if (ok) {
          setBusy(false);
          await handleSave(true);
          return;
        }
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const headerLabel =
    mode.kind === "import"
      ? "Import image"
      : mode.kind === "edit"
        ? "Edit image"
        : "Duplicate image";

  const saveLabel =
    mode.kind === "import"
      ? "Save"
      : mode.kind === "edit"
        ? "Save changes"
        : "Save copy";

  const undoCount = undoStackRef.current.length;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70"
        onClick={() => !busy && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={headerLabel}
        className="fixed inset-4 z-50 mx-auto flex max-w-300 flex-col border-2 border-neutral-700 bg-neutral-950"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b-2 border-neutral-800 bg-neutral-900 px-4 py-2">
          <h2 className="font-display text-xs uppercase tracking-wider text-emerald-400">
            {headerLabel}
          </h2>
          {meta?.originalPath && (
            <p
              className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-500"
              title={meta.originalPath}
            >
              {meta.originalPath}
            </p>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={() => !busy && onClose()}
            className="border border-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50"
            disabled={busy}
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
          {/* Left: canvas (or drop zone for fresh imports without a source yet) */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {display && working ? (
              <CropCanvas
                source={display}
                sourceWidth={working.width}
                sourceHeight={working.height}
                crop={crop}
                onCropChange={setCrop}
                snap={snap}
                width={720}
                height={520}
                onSamplePixel={
                  samplerMode !== "none" ? handlePixelClick : undefined
                }
              />
            ) : mode.kind === "import" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-130 w-180 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed transition-colors ${
                  isDragOver
                    ? "border-emerald-500 bg-emerald-950/30"
                    : "border-neutral-700 bg-neutral-900 hover:border-neutral-500 hover:bg-neutral-900/70"
                }`}
              >
                <DropTargetIcon />
                <p className="font-display text-xs uppercase tracking-wider text-neutral-300">
                  Drop image
                </p>
                <p className="font-mono text-[11px] text-neutral-500">
                  …or click to pick a file
                </p>
                <p className="font-mono text-[10px] text-neutral-600">
                  PNG · JPG · WEBP · GIF · SVG · BMP
                </p>
              </div>
            ) : (
              <div className="font-mono text-xs text-neutral-500">
                Loading…
              </div>
            )}
          </div>

          {/* Right: sidebar with controls */}
          <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l-2 border-neutral-800 bg-neutral-900/50 p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/bmp"
              onChange={onPickFile}
              className="hidden"
            />

            {meta && working ? (
              <SourceSummary
                meta={meta}
                width={working.width}
                height={working.height}
                onReplace={
                  mode.kind === "import"
                    ? () => fileInputRef.current?.click()
                    : null
                }
              />
            ) : (
              mode.kind === "import" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Pick file…
                </Button>
              )
            )}

            {working && display && (
              <>
                <ToolSection title="Crop" onReset={resetCrop}>
                  <CropControls
                    source={display}
                    sourceWidth={working.width}
                    sourceHeight={working.height}
                    crop={crop}
                    onCropChange={setCrop}
                    snap={snap}
                    onSnapChange={setSnap}
                    magicActive={samplerMode === "magic-crop"}
                    onMagicToggle={() =>
                      setSamplerMode((m) =>
                        m === "magic-crop" ? "none" : "magic-crop",
                      )
                    }
                  />
                </ToolSection>

                <ToolSection title="Background" onReset={resetBackground}>
                  <BgRemovePanel
                    eyedropperActive={samplerMode === "bg-color"}
                    sample={bgSample}
                    mode={bgMode}
                    tolerance={bgTolerance}
                    onPickColor={() =>
                      setSamplerMode((m) =>
                        m === "bg-color" ? "none" : "bg-color",
                      )
                    }
                    onModeChange={setBgMode}
                    onToleranceChange={setBgTolerance}
                    onApply={handleApplyBgRemove}
                    onMlRemove={handleMlBgRemove}
                    mlBusy={mlBusy}
                    mlProgress={mlProgress}
                    mlError={mlError}
                  />
                </ToolSection>

                <ToolSection title="Tint" onReset={resetTint}>
                  <TintPanel
                    color={tintColor}
                    power={tintPower}
                    alpha={tintAlpha}
                    bgFill={tintBgFill}
                    onColorChange={setTintColor}
                    onPowerChange={setTintPower}
                    onAlphaChange={setTintAlpha}
                    onBgFillChange={setTintBgFill}
                  />
                </ToolSection>

                <ToolSection title="Transform">
                  <div className="flex flex-wrap gap-1.5">
                    <ToolButton onClick={handleFlipH} title="Mirror horizontally">
                      Flip H
                    </ToolButton>
                    <ToolButton onClick={handleFlipV} title="Mirror vertically">
                      Flip V
                    </ToolButton>
                    <ToolButton
                      onClick={handleAutoTrim}
                      title="Crop transparent borders"
                    >
                      Auto-trim
                    </ToolButton>
                    <ToolButton
                      onClick={handleUndo}
                      disabled={undoCount === 0}
                      title="Revert the last destructive op"
                    >
                      ↶ Undo {undoCount > 0 ? `(${undoCount})` : ""}
                    </ToolButton>
                    <ToolButton
                      onClick={handleReset}
                      title="Discard all edits and reload the source"
                    >
                      ⟲ Reset
                    </ToolButton>
                  </div>
                </ToolSection>

                {/* Destination is mode-specific. Edit hides the picker
                    entirely (target is locked); duplicate hides the
                    picker but keeps filename editable; import shows
                    the full picker. */}
                {mode.kind === "import" && (
                  <div className="border-t border-neutral-800 pt-3">
                    <FolderPicker onChange={setTargetDir} />
                  </div>
                )}
                {mode.kind === "duplicate" && targetDir && (
                  <div className="border-t border-neutral-800 pt-3">
                    <p className={fieldLabel}>Saving to</p>
                    <p
                      className="mt-1 truncate border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-[11px] text-neutral-300"
                      title={targetDir}
                    >
                      {targetDir}
                    </p>
                  </div>
                )}

                {mode.kind !== "edit" && (
                  <div>
                    <label className={fieldLabel}>Filename</label>
                    <input
                      type="text"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      placeholder="my-sprite.png"
                      className={`${textInput} font-mono`}
                    />
                    <p className="mt-1 font-mono text-[10px] text-neutral-600">
                      Always saved as PNG.
                    </p>
                  </div>
                )}
              </>
            )}

            {error && (
              <p className="font-mono text-[11px] text-red-400">{error}</p>
            )}
          </aside>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t-2 border-neutral-800 bg-neutral-900 px-4 py-2">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleSave(false)}
            disabled={busy || !working || !targetDir || !filename}
          >
            {busy ? "Saving…" : saveLabel}
          </Button>
        </footer>
      </div>
    </>
  );
}

function ToolSection({
  title,
  onReset,
  children,
}: {
  title: string;
  /** When provided, a small ↺ icon button appears next to the section
   *  title. Clicking it resets just this section's settings — lets the
   *  user "regret" one tweak (a tint power they overshot, a tolerance
   *  slider that went too high) without losing every other edit they
   *  made via the global Reset under Transform. */
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-neutral-800 pt-3">
      <div className="flex items-center justify-between">
        <p className={fieldLabel}>{title}</p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            title={`Reset ${title.toLowerCase()} settings`}
            aria-label={`Reset ${title}`}
            className="border border-transparent px-1 font-mono text-xs text-neutral-500 leading-none transition-colors hover:border-neutral-700 hover:text-emerald-300"
          >
            ↺
          </button>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ToolButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
    >
      {children}
    </button>
  );
}

function BgRemovePanel({
  eyedropperActive,
  sample,
  mode,
  tolerance,
  onPickColor,
  onModeChange,
  onToleranceChange,
  onApply,
  onMlRemove,
  mlBusy,
  mlProgress,
  mlError,
}: {
  eyedropperActive: boolean;
  sample: RGB | null;
  mode: BgRemoveMode;
  tolerance: number;
  onPickColor: () => void;
  onModeChange: (m: BgRemoveMode) => void;
  onToleranceChange: (n: number) => void;
  onApply: () => void;
  onMlRemove: () => void;
  mlBusy: boolean;
  mlProgress: { key: string; ratio: number } | null;
  mlError: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* ML bg removal — destructive, one-click. Sits at the top of
          the Background section since it's the high-quality option for
          photographic / non-pixel-art sources where the manual
          eyedropper + tolerance flow can't easily separate subject
          from gradient bg. First call downloads the BRIA RMBG model
          (~44MB at fp16) to the browser's cache; subsequent calls
          skip the fetch. Progress callback emits a key + (current,
          total) — we surface it as a tiny progress bar below the
          button so a long first-call wait is legible. */}
      <button
        type="button"
        onClick={onMlRemove}
        disabled={mlBusy}
        className="flex w-fit items-center gap-1.5 border border-emerald-700 bg-emerald-950/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-950/60 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
        title="Run BRIA RMBG ML segmentation. Best for photographic / non-pixel-art sources. First click downloads ~44MB model."
      >
        <span aria-hidden>✦</span>
        {mlBusy ? "Running ML…" : "ML remove bg"}
      </button>
      {mlBusy && (
        <div className="flex flex-col gap-0.5">
          <div className="h-1.5 w-full overflow-hidden border border-neutral-800 bg-neutral-900">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${(mlProgress?.ratio ?? 0) * 100}%` }}
            />
          </div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">
            {mlProgress
              ? `${mlProgress.key} · ${Math.round(mlProgress.ratio * 100)}%`
              : "starting…"}
          </p>
        </div>
      )}
      {mlError && (
        <p className="font-mono text-[10px] text-red-400">{mlError}</p>
      )}
      <p className="font-mono text-[10px] text-neutral-600">
        For photographic / non-pixel-art sources. First run downloads ~44MB to your browser cache.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPickColor}
          className={`flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            eyedropperActive
              ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
              : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-emerald-700 hover:text-emerald-300"
          }`}
        >
          <span aria-hidden>⏷</span>
          {eyedropperActive ? "Click image…" : "Pick bg color"}
        </button>
        {sample && (
          <span
            className="size-5 border border-neutral-700"
            title={`rgb(${sample.r}, ${sample.g}, ${sample.b})`}
            style={{
              backgroundColor: `rgb(${sample.r}, ${sample.g}, ${sample.b})`,
            }}
          />
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-neutral-400">
        Mode
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as BgRemoveMode)}
          className={`${textInput} mt-0 w-auto`}
        >
          <option value="connected">connected (flood fill)</option>
          <option value="key">key (everywhere)</option>
        </select>
      </label>

      <SliderField
        label="Tolerance"
        min={0}
        max={120}
        step={1}
        value={tolerance}
        onChange={onToleranceChange}
        format={(v) => String(v)}
      />

      <Button
        size="sm"
        variant="secondary"
        onClick={onApply}
        disabled={!sample}
      >
        Apply
      </Button>
      <p className="font-mono text-[10px] text-neutral-600">
        {mode === "connected"
          ? "Removes only pixels connected to the sampled point."
          : "Removes every pixel in the image matching the color."}
      </p>
    </div>
  );
}

function TintPanel({
  color,
  power,
  alpha,
  bgFill,
  onColorChange,
  onPowerChange,
  onAlphaChange,
  onBgFillChange,
}: {
  color: string;
  power: number;
  alpha: number;
  bgFill: number;
  onColorChange: (hex: string) => void;
  onPowerChange: (n: number) => void;
  onAlphaChange: (n: number) => void;
  onBgFillChange: (n: number) => void;
}) {
  const rgb = parseHexColor(color);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="size-7 cursor-pointer border border-neutral-700 bg-neutral-900"
        />
        <input
          type="text"
          value={rgb ? rgbToHex(rgb) : color}
          onChange={(e) => onColorChange(e.target.value)}
          className={`${textInput} mt-0 flex-1 font-mono`}
          placeholder="#rrggbb"
        />
      </div>
      <SliderField
        label="Power"
        min={0}
        max={1}
        step={0.01}
        value={power}
        onChange={onPowerChange}
        format={(v) => `${Math.round(v * 100)}%`}
        hint="Mix the tint into visible pixels."
      />
      <SliderField
        label="Alpha"
        min={0}
        max={1}
        step={0.01}
        value={alpha}
        onChange={onAlphaChange}
        format={(v) => `${Math.round(v * 100)}%`}
        hint="Output opacity of visible pixels (1 = unchanged)."
      />
      <SliderField
        label="Bg fill"
        min={0}
        max={1}
        step={0.01}
        value={bgFill}
        onChange={onBgFillChange}
        format={(v) => `${Math.round(v * 100)}%`}
        hint="Paint transparent pixels with the tint color (0 = visible image only)."
      />
      <p className="font-mono text-[10px] text-neutral-600">
        All three are live preview; baked in on save.
      </p>
    </div>
  );
}

function SourceSummary({
  meta,
  width,
  height,
  onReplace,
}: {
  meta: SourceMeta;
  width: number;
  height: number;
  onReplace: (() => void) | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className={fieldLabel}>Source</p>
      <p
        className="truncate font-mono text-[11px] text-neutral-200"
        title={meta.suggestedName}
      >
        {meta.suggestedName}
      </p>
      <p className="font-mono text-[10px] text-neutral-500">
        {width}×{height} px
        {meta.originalSize !== null ? ` · ${fmtBytes(meta.originalSize)}` : ""}
      </p>
      {onReplace && (
        <button
          type="button"
          onClick={onReplace}
          className="mt-1 w-fit border border-neutral-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-400 transition-colors hover:border-emerald-700 hover:text-emerald-300"
        >
          Replace…
        </button>
      )}
    </div>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function withSuffix(filename: string, suffix: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return `${filename}${suffix}`;
  return `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`;
}

function extractCropToCanvas(
  source: HTMLCanvasElement,
  crop: CropRect,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = crop.w;
  c.height = crop.h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  return c;
}

function DropTargetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="48"
      height="48"
      shapeRendering="crispEdges"
      fill="currentColor"
      className="text-neutral-600"
      aria-hidden="true"
    >
      <rect x="10" y="2" width="4" height="9" />
      <rect x="7" y="8" width="2" height="2" />
      <rect x="9" y="10" width="2" height="2" />
      <rect x="13" y="10" width="2" height="2" />
      <rect x="15" y="8" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" opacity="0.6" />
      <rect x="2" y="16" width="20" height="2" />
      <rect x="2" y="16" width="2" height="6" />
      <rect x="20" y="16" width="2" height="6" />
      <rect x="2" y="20" width="20" height="2" />
    </svg>
  );
}
