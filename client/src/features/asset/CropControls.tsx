import { useEffect, useState } from "react";

import { fieldLabel, textInput } from "../../styles/classes";
import { CHECKER_STYLE } from "./format";
import { constrainRect, type CropRect } from "./cropMath";

// Side panel paired with CropCanvas. Hosts the numeric X/Y/W/H inputs
// (so you can dial in a known atlas tile by typing), the snap selector,
// the enable-crop checkbox, and a small live preview of the cropped
// result. Each numeric input is integer-only and clamps to the source
// image bounds — the canvas does the same on drag, so the two stay
// consistent regardless of which surface the user changes the rect from.

interface Props {
  /** Either the original image, or the editor's working canvas (for
   *  edit mode where flips and bg-removal mutate it). */
  source: HTMLImageElement | HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
  crop: CropRect | null;
  onCropChange: (next: CropRect | null) => void;
  snap: number;
  onSnapChange: (next: number) => void;
  /** Whether the magic-crop sampler is currently active (next click on
   *  the canvas runs subject detection). When set, the Magic button
   *  shows an active state and the helper text changes to prompt the
   *  user for the click. */
  magicActive?: boolean;
  /** Toggle handler for magic-crop mode. The editor manages mutual
   *  exclusion with other samplers (bg-color eyedropper, etc.). */
  onMagicToggle?: () => void;
}

const SNAP_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "off" },
  { value: 2, label: "2 px" },
  { value: 4, label: "4 px" },
  { value: 8, label: "8 px" },
  { value: 16, label: "16 px" },
  { value: 32, label: "32 px" },
];

export function CropControls({
  source,
  sourceWidth: imgW,
  sourceHeight: imgH,
  crop,
  onCropChange,
  snap,
  onSnapChange,
  magicActive = false,
  onMagicToggle,
}: Props) {
  const enabled = crop !== null;
  const effectiveCrop: CropRect = crop ?? { x: 0, y: 0, w: imgW, h: imgH };

  const handleField = (key: keyof CropRect, raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const next = constrainRect(
      { ...effectiveCrop, [key]: Math.max(0, n) },
      imgW,
      imgH,
    );
    if (next.w <= 0 || next.h <= 0) return;
    onCropChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) =>
              onCropChange(
                e.target.checked
                  ? { x: 0, y: 0, w: imgW, h: imgH }
                  : null,
              )
            }
            className="size-3 accent-emerald-600"
          />
          Enable crop
        </label>
        <p className="mt-1 font-mono text-[10px] text-neutral-600">
          Off → save the full source image as-is.
        </p>
      </div>

      {/* Magic crop is a click-seeded sampler: button activates the mode,
          the next click on the canvas runs detectSubjectBoundsAtClick
          and sets the crop rect to the connected subject's bbox.
          Setting `crop` to a non-null value also auto-ticks the Enable
          crop checkbox above (it reads `enabled = crop !== null`), so
          there's no Enable-crop-first step — the modes compose. The
          helper text changes when active to prompt for the click. */}
      {onMagicToggle && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onMagicToggle}
            className={`flex w-fit items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              magicActive
                ? "border-emerald-500 bg-emerald-950/60 text-emerald-200"
                : "border-emerald-700 bg-emerald-950/40 text-emerald-300 hover:border-emerald-500 hover:bg-emerald-950/60"
            }`}
            title="Click the button, then click on the subject in the image. The crop snaps to that subject's bounding box."
          >
            <span aria-hidden>✦</span>
            {magicActive ? "Click on subject…" : "Magic crop"}
          </button>
          <p className="font-mono text-[10px] text-neutral-600">
            {magicActive
              ? "Click on the visible part of the image to crop to it."
              : "Click, then click on the subject in the image."}
          </p>
        </div>
      )}

      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Numeric
              label="X"
              value={effectiveCrop.x}
              onCommit={(v) => handleField("x", v)}
              max={imgW - 1}
            />
            <Numeric
              label="Y"
              value={effectiveCrop.y}
              onCommit={(v) => handleField("y", v)}
              max={imgH - 1}
            />
            <Numeric
              label="W"
              value={effectiveCrop.w}
              onCommit={(v) => handleField("w", v)}
              max={imgW}
              min={1}
            />
            <Numeric
              label="H"
              value={effectiveCrop.h}
              onCommit={(v) => handleField("h", v)}
              max={imgH}
              min={1}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-neutral-300">
            Snap
            <select
              value={snap}
              onChange={(e) => onSnapChange(Number(e.target.value))}
              className={`${textInput} mt-0 w-auto`}
            >
              {SNAP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className={fieldLabel}>Output preview</p>
            <CroppedPreview source={source} crop={effectiveCrop} />
            <p className="mt-1 font-mono text-[10px] text-neutral-500">
              {effectiveCrop.w}×{effectiveCrop.h} px
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// Small live preview of the cropped region. Re-renders whenever crop
// changes or the source image identity changes. We use a hidden canvas
// rather than CSS clipping because the source image's natural pixel
// resolution is what we want to preview at integer zoom — clipping +
// scaling via CSS leaves the rest of the image rendered (wasted), and
// gives less control over nearest-neighbor crispness.
function CroppedPreview({
  source,
  crop,
}: {
  source: HTMLImageElement | HTMLCanvasElement;
  crop: CropRect;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (crop.w <= 0 || crop.h <= 0) {
      setUrl(null);
      return;
    }
    const c = document.createElement("canvas");
    c.width = crop.w;
    c.height = crop.h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      source,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      crop.w,
      crop.h,
    );
    setUrl(c.toDataURL("image/png"));
  }, [source, crop.x, crop.y, crop.w, crop.h]);
  if (!url) return null;
  return (
    <div
      className="mt-1 flex items-center justify-center border border-neutral-800 p-2"
      style={{ ...CHECKER_STYLE, height: 96 }}
    >
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

// Integer-only numeric field with commit-on-blur / Enter behavior. Free-
// typing without committing on every keystroke avoids a stutter when
// typing "120" — committing per-stroke would briefly clamp at 1 → 12 →
// 120 and visually flash mid-clamp.
function Numeric({
  label,
  value,
  onCommit,
  min,
  max,
}: {
  label: string;
  value: number;
  onCommit: (raw: string) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      <span className="w-3 text-right font-mono uppercase text-neutral-500">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        step={1}
        min={min ?? 0}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`${textInput} mt-0 w-full font-mono`}
      />
    </label>
  );
}
