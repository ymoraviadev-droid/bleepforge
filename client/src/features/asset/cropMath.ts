// Pure math + canvas helpers for the crop tool. Kept separate from the
// React component so the geometry is tested-by-eye in isolation and the
// component file stays focused on rendering + event wiring.
//
// Coordinate conventions used throughout:
//   - "source pixels": coordinates inside the original image (0..W,0..H).
//   - "canvas pixels": coordinates in the on-screen <canvas> element.
// All persisted state (CropRect, image dims) is in source pixels —
// canvas pixels are only ever a transient render concern.

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Snap a value to the nearest multiple of `unit`. unit === 1 → no-op. */
export function snapTo(value: number, unit: number): number {
  if (unit <= 1) return Math.round(value);
  return Math.round(value / unit) * unit;
}

/** Clamp x to [0, max] (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Normalize a possibly-negative-size rect (e.g. from drag-start →
 * drag-end where the cursor moved up-and-left) into a positive-size one,
 * then constrain it to the image bounds. Returns null if the result has
 * zero area (the user clicked without dragging).
 */
export function normalizeAndClamp(
  rawX0: number,
  rawY0: number,
  rawX1: number,
  rawY1: number,
  imageW: number,
  imageH: number,
): CropRect | null {
  const x0 = Math.min(rawX0, rawX1);
  const y0 = Math.min(rawY0, rawY1);
  const x1 = Math.max(rawX0, rawX1);
  const y1 = Math.max(rawY0, rawY1);
  const cx = clamp(x0, 0, imageW);
  const cy = clamp(y0, 0, imageH);
  const cw = clamp(x1, 0, imageW) - cx;
  const ch = clamp(y1, 0, imageH) - cy;
  if (cw <= 0 || ch <= 0) return null;
  return { x: cx, y: cy, w: cw, h: ch };
}

/** Constrain a rect to the image bounds, preserving (x,y) origin and
 *  shrinking width/height if needed. */
export function constrainRect(
  rect: CropRect,
  imageW: number,
  imageH: number,
): CropRect {
  const x = clamp(rect.x, 0, imageW);
  const y = clamp(rect.y, 0, imageH);
  const maxW = imageW - x;
  const maxH = imageH - y;
  return {
    x,
    y,
    w: clamp(rect.w, 0, maxW),
    h: clamp(rect.h, 0, maxH),
  };
}

/**
 * Move a rect by (dx, dy) source-pixels, keeping it inside the image
 * (the rect is clamped — it doesn't shrink, just stops sliding when it
 * hits an edge). Used for the move-rect drag mode.
 */
export function translateRect(
  rect: CropRect,
  dx: number,
  dy: number,
  imageW: number,
  imageH: number,
): CropRect {
  const newX = clamp(rect.x + dx, 0, imageW - rect.w);
  const newY = clamp(rect.y + dy, 0, imageH - rect.h);
  return { ...rect, x: newX, y: newY };
}

// Edge / corner identifiers for the resize-handle drag mode. "tl" =
// top-left corner, "t" = top edge midpoint, etc.
export type Handle =
  | "tl" | "t" | "tr"
  | "l"        | "r"
  | "bl" | "b" | "br";

export const ALL_HANDLES: readonly Handle[] = [
  "tl", "t", "tr", "l", "r", "bl", "b", "br",
];

/**
 * Resize a rect by dragging one of its handles to a new source-pixel
 * position. The opposite edge stays anchored; the dragged edge follows
 * the pointer. Width/height clamped to ≥1 so the rect never inverts.
 */
export function resizeByHandle(
  base: CropRect,
  handle: Handle,
  pointerX: number,
  pointerY: number,
  imageW: number,
  imageH: number,
): CropRect {
  const px = clamp(pointerX, 0, imageW);
  const py = clamp(pointerY, 0, imageH);
  let { x, y, w, h } = base;
  // Treat the pointer as the new position of the edge identified by the
  // handle. Compute the opposing edge first so we can invert if needed.
  const right = base.x + base.w;
  const bottom = base.y + base.h;

  if (handle.includes("l")) {
    x = Math.min(px, right - 1);
    w = right - x;
  }
  if (handle.includes("r")) {
    w = Math.max(1, px - base.x);
  }
  if (handle.includes("t")) {
    y = Math.min(py, bottom - 1);
    h = bottom - y;
  }
  if (handle.includes("b")) {
    h = Math.max(1, py - base.y);
  }
  return constrainRect({ x, y, w, h }, imageW, imageH);
}

/**
 * Hit-test source-pixel coordinates against a crop rect's handles.
 * `handleHalfSize` is in source-px and is small (1–2) so handles snap
 * to per-pixel precision; the canvas separately enlarges the visual
 * handle to ~6×6 canvas-px for usability.
 */
export function hitTestHandle(
  rect: CropRect,
  px: number,
  py: number,
  handleHalfSize: number,
): Handle | null {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const positions: { handle: Handle; x: number; y: number }[] = [
    { handle: "tl", x: rect.x, y: rect.y },
    { handle: "t", x: cx, y: rect.y },
    { handle: "tr", x: rect.x + rect.w, y: rect.y },
    { handle: "l", x: rect.x, y: cy },
    { handle: "r", x: rect.x + rect.w, y: cy },
    { handle: "bl", x: rect.x, y: rect.y + rect.h },
    { handle: "b", x: cx, y: rect.y + rect.h },
    { handle: "br", x: rect.x + rect.w, y: rect.y + rect.h },
  ];
  for (const p of positions) {
    if (
      Math.abs(px - p.x) <= handleHalfSize &&
      Math.abs(py - p.y) <= handleHalfSize
    ) {
      return p.handle;
    }
  }
  return null;
}

/** True if the source-pixel point is inside the rect (excluding handles). */
export function pointInRect(rect: CropRect, px: number, py: number): boolean {
  return (
    px >= rect.x && px < rect.x + rect.w && py >= rect.y && py < rect.y + rect.h
  );
}

/**
 * Render the chosen sub-region of the source image to a fresh PNG blob.
 * Used at save-time to produce the bytes the importer uploads. When
 * `crop` is null we return the full image (re-encoded as PNG so the
 * output extension is consistent).
 */
export async function extractToPngBase64(
  image: HTMLImageElement,
  crop: CropRect | null,
): Promise<string> {
  const w = crop ? crop.w : image.naturalWidth;
  const h = crop ? crop.h : image.naturalHeight;
  const sx = crop ? crop.x : 0;
  const sy = crop ? crop.y : 0;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h);
  // toDataURL → strip the "data:image/png;base64," prefix so the server
  // gets the raw base64 it expects.
  const dataUrl = canvas.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("malformed data URL");
  return dataUrl.slice(comma + 1);
}

/** Cursor CSS string for a given handle (or "move" / "crosshair"). */
export function cursorForHandle(h: Handle): string {
  switch (h) {
    case "tl":
    case "br":
      return "nwse-resize";
    case "tr":
    case "bl":
      return "nesw-resize";
    case "t":
    case "b":
      return "ns-resize";
    case "l":
    case "r":
      return "ew-resize";
  }
}
