// Pixel-level image operations for the editor. All functions operate on
// HTMLCanvasElement so they compose cleanly: load image into a canvas,
// pipe through flip → bg-remove → tint → save.
//
// Performance: getImageData / putImageData copy the entire pixel buffer
// each call, but pixel-art game assets are tiny (<512×512 typical) so
// the round-trip is sub-millisecond. We don't bother with workers or
// WebGL — the simplest code is the right code at this scale.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

/** Read one pixel out of a canvas. Used by bg-removal's "click to sample
 *  the bg color" flow — much simpler than tracking raw image data on
 *  the React side. */
export function sampleColor(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): RGBA | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  const data = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! };
}

/** Mirror across the vertical axis. */
export function flipHorizontal(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Round-trip through a same-sized scratch canvas so the in-place
  // re-blit doesn't fight transform state across calls.
  const scratch = cloneTo(canvas);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

/** Mirror across the horizontal axis. */
export function flipVertical(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scratch = cloneTo(canvas);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(0, canvas.height);
  ctx.scale(1, -1);
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

/**
 * Crop transparent rows/columns off the edges. Pairs naturally with bg
 * removal — once the background is alpha=0, auto-trim shrinks the canvas
 * to just the subject. Resizes the canvas in place; returns the
 * tight-fit rect that was kept (in original coordinates) so callers can
 * adjust e.g. a parent crop overlay.
 */
export function autoTrim(
  canvas: HTMLCanvasElement,
  alphaThreshold = 0,
): { x: number; y: number; w: number; h: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return null;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3]!;
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    // Fully transparent — nothing to trim. Leave canvas alone.
    return null;
  }
  const newW = maxX - minX + 1;
  const newH = maxY - minY + 1;
  if (newW === w && newH === h) return { x: 0, y: 0, w, h };
  // Copy the kept region into a scratch canvas, resize the source
  // canvas, blit back.
  const scratch = document.createElement("canvas");
  scratch.width = newW;
  scratch.height = newH;
  const sctx = scratch.getContext("2d");
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(canvas, minX, minY, newW, newH, 0, 0, newW, newH);
  canvas.width = newW;
  canvas.height = newH;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0);
  return { x: minX, y: minY, w: newW, h: newH };
}

export type BgRemoveMode = "connected" | "key";

export interface BgRemoveOptions {
  /** Color to remove (read from the source canvas before the call). */
  target: RGB;
  /** RGB-distance tolerance, 0..255. 0 = exact match only. */
  tolerance: number;
  mode: BgRemoveMode;
  /** Required when mode === "connected" — start point for the flood. */
  startX?: number;
  startY?: number;
}

/**
 * Remove pixels matching `target` (within tolerance) by zeroing their
 * alpha channel. Two modes:
 *
 *   - "connected": flood fill from (startX, startY). Only contiguous
 *     pixels matching the color are removed. Right tool for "the
 *     background corners are blue, but the character has blue eyes
 *     too — leave the eyes alone."
 *   - "key": removes every matching pixel anywhere in the image.
 *     Right tool for "magenta-keyed sprite sheet" workflows.
 *
 * Pixels with existing alpha=0 are skipped (idempotent, and avoids
 * touching pixels we already cleared in a previous pass).
 */
export function removeBackground(
  canvas: HTMLCanvasElement,
  opts: BgRemoveOptions,
): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const tol2 = opts.tolerance * opts.tolerance;
  const tr = opts.target.r;
  const tg = opts.target.g;
  const tb = opts.target.b;

  const matches = (i: number): boolean => {
    if (px[i + 3] === 0) return false;
    const dr = px[i]! - tr;
    const dg = px[i + 1]! - tg;
    const db = px[i + 2]! - tb;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  let removed = 0;

  if (opts.mode === "key") {
    for (let i = 0; i < px.length; i += 4) {
      if (matches(i)) {
        px[i + 3] = 0;
        removed++;
      }
    }
  } else {
    // Connected — scanline flood fill from (startX, startY). Stack-based
    // so we don't blow the call stack on big images.
    const sx = opts.startX ?? 0;
    const sy = opts.startY ?? 0;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
      ctx.putImageData(img, 0, 0);
      return 0;
    }
    if (!matches((sy * w + sx) * 4)) {
      // Sample point doesn't match the target itself — nothing to do.
      ctx.putImageData(img, 0, 0);
      return 0;
    }
    const stack: [number, number][] = [[sx, sy]];
    while (stack.length > 0) {
      const popped = stack.pop()!;
      let [x, y] = popped;
      // Walk left to find span start.
      while (x >= 0 && matches((y * w + x) * 4)) x--;
      x++;
      let spanAbove = false;
      let spanBelow = false;
      // Walk right, clearing as we go.
      while (x < w && matches((y * w + x) * 4)) {
        px[(y * w + x) * 4 + 3] = 0;
        removed++;
        // Above
        if (y > 0) {
          const ai = ((y - 1) * w + x) * 4;
          const aboveMatch = matches(ai);
          if (!spanAbove && aboveMatch) {
            stack.push([x, y - 1]);
            spanAbove = true;
          } else if (spanAbove && !aboveMatch) {
            spanAbove = false;
          }
        }
        // Below
        if (y < h - 1) {
          const bi = ((y + 1) * w + x) * 4;
          const belowMatch = matches(bi);
          if (!spanBelow && belowMatch) {
            stack.push([x, y + 1]);
            spanBelow = true;
          } else if (spanBelow && !belowMatch) {
            spanBelow = false;
          }
        }
        x++;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return removed;
}

/**
 * Linear color overlay tint with three dials:
 *
 *   power        0..1  — strength of the color mix on visible pixels.
 *                        0 = no tint, 1 = solid color, fully replacing
 *                        the original RGB.
 *
 *   outputAlpha  0..1  — multiplier on the OUTPUT alpha for visible
 *                        pixels. 1 = unchanged. Lets you fade an image
 *                        without touching the color mix.
 *
 *   bgFill       0..1  — strength of the tint color painted INTO
 *                        currently-transparent pixels (using the same
 *                        tint color). 0 = visible-only (default); 1 =
 *                        transparent pixels become solid tint color.
 *                        "Tint reaches the bg too" — quick path to
 *                        a subject + bg in the same color without
 *                        opening the Bg color section.
 *
 * Note: Tint and the Bg color section both touch transparent pixels
 * but with different colors. Apply order in the editor is tint first
 * (so its bgFill paints with the tint color), then bg color (which
 * only fills pixels still at alpha === 0). In practice the user picks
 * one path or the other — they're mostly mutually exclusive at the
 * per-pixel level. Tint is the "same color as subject" shortcut; Bg
 * color is the "different color from subject" path.
 */
export function applyTint(
  canvas: HTMLCanvasElement,
  color: RGB,
  power: number,
  outputAlpha = 1,
  bgFill = 0,
): void {
  if (power <= 0 && outputAlpha >= 1 && bgFill <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const p = Math.min(1, Math.max(0, power));
  const ip = 1 - p;
  const oa = Math.min(1, Math.max(0, outputAlpha));
  const bf = Math.min(1, Math.max(0, bgFill));
  const bgFillAlpha = Math.round(255 * bf);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    if (a === 0) {
      // Transparent pixel — paint with the tint color when bgFill > 0.
      // RGB on transparent pixels is otherwise garbage (encoder
      // leftovers) so we replace it wholesale rather than mix.
      if (bf > 0) {
        px[i] = color.r;
        px[i + 1] = color.g;
        px[i + 2] = color.b;
        px[i + 3] = bgFillAlpha;
      }
      continue;
    }
    if (p > 0) {
      px[i] = Math.round(px[i]! * ip + color.r * p);
      px[i + 1] = Math.round(px[i + 1]! * ip + color.g * p);
      px[i + 2] = Math.round(px[i + 2]! * ip + color.b * p);
    }
    if (oa < 1) {
      px[i + 3] = Math.round(a * oa);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export interface AutoDetectResult {
  /** The dominant perimeter color, or null if the image's edges are
   *  already mostly transparent (no work to do). */
  bg: RGB | null;
  /** True when the perimeter is mostly alpha=0 — caller should treat
   *  this as "already separated, nothing to remove" rather than apply
   *  bg removal with whatever weak signal got picked. */
  alreadyTransparent: boolean;
}

/**
 * Auto-detect the background color of a pixel-art image by sampling
 * pixels along the canvas perimeter. The dominant sampled color is the
 * "best guess" at what counts as background. For ~90% of game assets
 * (subjects centered on a uniform-ish bg, OR already transparent) this
 * gets the right answer in one click.
 *
 * Algorithm:
 *   1. Pick `samples` points evenly distributed along the four edges
 *      (corners + interpolated points along each side).
 *   2. Quantize each sampled (r,g,b,a) to a coarse bucket (≈16-step
 *      grid) so anti-aliasing fringes group with their parent color.
 *   3. Take the modal bucket. Its centroid (averaged from the actual
 *      sampled pixels in that bucket) is the bg color.
 *   4. If the modal bucket has alpha < `alphaThreshold`, mark
 *      `alreadyTransparent` — caller skips the removal pass.
 *
 * Returns null only on canvases with zero area; everything else
 * resolves to either a color or `alreadyTransparent: true`.
 */
export function autoDetectBackground(
  canvas: HTMLCanvasElement,
  samples = 24,
  alphaThreshold = 30,
): AutoDetectResult | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return null;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Build the perimeter sample list. Distribute roughly evenly across
  // the four edges so a sprite that bleeds out one side doesn't
  // dominate the histogram from corner samples alone.
  const points: { x: number; y: number }[] = [];
  const perEdge = Math.max(2, Math.floor(samples / 4));
  for (let i = 0; i < perEdge; i++) {
    const t = i / (perEdge - 1);
    const x = Math.floor(t * (w - 1));
    points.push({ x, y: 0 }); // top
    points.push({ x, y: h - 1 }); // bottom
    const y = Math.floor(t * (h - 1));
    points.push({ x: 0, y }); // left
    points.push({ x: w - 1, y }); // right
  }

  // Histogram by coarse bucket. 16-step quantization is loose enough to
  // group anti-aliasing fringes with their parent color but tight
  // enough that genuinely different bg colors stay separated.
  //
  // Important: fully-transparent pixels collapse to a single bucket
  // regardless of their stored RGB. PNGs commonly hold garbage RGB on
  // alpha=0 pixels (encoder-dependent), and bucketing those by RGB
  // splits "the same transparent background" into many tiny buckets,
  // which then lose to any opaque perimeter color cluster — exactly the
  // pattern that made Magic crop fail to recognize transparent-bg
  // sprites as already separated.
  const STEP = 16;
  const buckets = new Map<
    string,
    { sumR: number; sumG: number; sumB: number; sumA: number; count: number }
  >();
  for (const p of points) {
    const i = (p.y * w + p.x) * 4;
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    const a = px[i + 3]!;
    const key =
      a < alphaThreshold
        ? "transparent"
        : `${quant(r, STEP)},${quant(g, STEP)},${quant(b, STEP)}`;
    const bucket = buckets.get(key) ?? {
      sumR: 0,
      sumG: 0,
      sumB: 0,
      sumA: 0,
      count: 0,
    };
    bucket.sumR += r;
    bucket.sumG += g;
    bucket.sumB += b;
    bucket.sumA += a;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  let best: typeof buckets extends Map<string, infer V> ? V : never = {
    sumR: 0,
    sumG: 0,
    sumB: 0,
    sumA: 0,
    count: 0,
  };
  for (const b of buckets.values()) {
    if (b.count > best.count) best = b;
  }
  if (best.count === 0) return null;

  const avgA = best.sumA / best.count;
  if (avgA < alphaThreshold) {
    return { bg: null, alreadyTransparent: true };
  }
  return {
    bg: {
      r: Math.round(best.sumR / best.count),
      g: Math.round(best.sumG / best.count),
      b: Math.round(best.sumB / best.count),
    },
    alreadyTransparent: false,
  };
}

function quant(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/**
 * One-click "magic crop" target: the bounding box of the image's
 * subject. Decides what's subject vs. bg using the same perimeter
 * heuristic as autoDetectBackground:
 *
 *   - If the perimeter is already mostly transparent → subject = every
 *     pixel with alpha > threshold. Bbox of that.
 *   - Otherwise → use the dominant perimeter color (with tolerance) as
 *     bg. Subject = every pixel that doesn't match. Bbox of that.
 *
 * Returns null if the image looks uniform (no subject distinguishable
 * from bg) or the canvas is zero-area. Caller (the editor) shows a
 * toast in that case rather than setting a degenerate crop.
 *
 * Non-destructive — does not modify pixel data. The caller wires the
 * returned rect into the crop overlay.
 */
/**
 * Click-seeded subject detection. Flood-fill (BFS) from a clicked pixel
 * through every non-bg pixel connected to it; returns the bounding box
 * of the reached region.
 *
 * This is what "Magic crop" runs when the user clicks on the canvas:
 *   - Click on the subject  → tight bbox of that subject's blob (handles
 *                              multi-subject sheets correctly)
 *   - Click on the bg       → fall back to detectSubjectBounds (whole-
 *                              image scan). Means clicking-anywhere
 *                              still does something useful.
 *
 * "What is bg" is decided the same way as detectSubjectBounds:
 * alpha-mode when ≥5% of pixels are transparent, otherwise dominant
 * perimeter color with tolerance.
 */
export function detectSubjectBoundsAtClick(
  canvas: HTMLCanvasElement,
  clickX: number,
  clickY: number,
  bgTolerance = 18,
  alphaThreshold = 8,
): { x: number; y: number; w: number; h: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return null;
  if (clickX < 0 || clickY < 0 || clickX >= w || clickY >= h) return null;

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Build the "is this pixel bg?" predicate, same way detectSubjectBounds
  // decides the mode.
  let transparentPixelCount = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i]! < 128) transparentPixelCount++;
  }
  const useAlphaMode = transparentPixelCount >= w * h * 0.05;

  let isBg: (i: number) => boolean;
  if (useAlphaMode) {
    isBg = (i: number) => px[i + 3]! <= alphaThreshold;
  } else {
    const detected = autoDetectBackground(canvas);
    if (!detected || !detected.bg) return null;
    const tr = detected.bg.r;
    const tg = detected.bg.g;
    const tb = detected.bg.b;
    const tol2 = bgTolerance * bgTolerance;
    isBg = (i: number) => {
      if (px[i + 3]! <= alphaThreshold) return true;
      const dr = px[i]! - tr;
      const dg = px[i + 1]! - tg;
      const db = px[i + 2]! - tb;
      return dr * dr + dg * dg + db * db <= tol2;
    };
  }

  // Click landed on bg → click-seeded flood would just trace the bg's
  // connected component, which is not what the user wants. Fall through
  // to the whole-image detection so the click-anywhere case still
  // produces a useful crop.
  const clickIdx = (clickY * w + clickX) * 4;
  if (isBg(clickIdx)) {
    return detectSubjectBounds(canvas, bgTolerance, alphaThreshold);
  }

  // Click on subject — BFS through non-bg pixels connected to the click.
  // Stack-based to avoid call-stack overflow on big sprites; Uint8Array
  // visited buffer is one byte per pixel (fast + cheap).
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  stack.push(clickX, clickY);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const flat = y * w + x;
    if (visited[flat]) continue;
    if (isBg(flat * 4)) continue;
    visited[flat] = 1;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }
  if (maxX < 0) return null;
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

export function detectSubjectBounds(
  canvas: HTMLCanvasElement,
  bgTolerance = 18,
  alphaThreshold = 8,
): { x: number; y: number; w: number; h: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return null;

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Decide between two detection modes:
  //   - alpha mode:  pixel art with a real transparent bg. Subject = any
  //                  pixel with alpha > threshold.
  //   - color mode:  opaque-bg image. Subject = any pixel that doesn't
  //                  match the dominant perimeter color (within tolerance).
  //
  // We pick alpha mode whenever ≥5% of pixels are transparent. That cleanly
  // separates "real transparent bg" from "anti-aliasing fringe on an
  // otherwise opaque image" — the former dominates pixel-art sprites; the
  // latter is rare in pixel art and would only matter for non-pixel-art
  // imports (concept art etc.) where color mode is the right call anyway.
  let transparentPixelCount = 0;
  const totalPixels = w * h;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i]! < 128) transparentPixelCount++;
  }
  const useAlphaMode = transparentPixelCount >= totalPixels * 0.05;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  if (useAlphaMode) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = px[(y * w + x) * 4 + 3]!;
        if (a > alphaThreshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
  } else {
    const detected = autoDetectBackground(canvas);
    if (!detected || !detected.bg) return null;
    const tr = detected.bg.r;
    const tg = detected.bg.g;
    const tb = detected.bg.b;
    const tol2 = bgTolerance * bgTolerance;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = px[i + 3]!;
        if (a <= alphaThreshold) continue; // already transparent → not subject
        const dr = px[i]! - tr;
        const dg = px[i + 1]! - tg;
        const db = px[i + 2]! - tb;
        if (dr * dr + dg * dg + db * db <= tol2) continue; // bg
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null; // no subject pixels found
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

/** Parse "#rrggbb" → RGB. Tolerates with/without leading #, lowercase
 *  or uppercase. Returns null on malformed input. */
export function parseHexColor(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, "");
  if (s.length !== 6) return null;
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** Format an RGB triple as "#rrggbb" for binding to <input type="color">. */
export function rgbToHex(c: RGB): string {
  const h = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** Make a fresh same-size canvas and copy the source into it. Used by
 *  ops that need a stable read-side surface while overwriting the
 *  destination (flip, in particular). */
function cloneTo(source: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = source.height;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
  }
  return c;
}

/**
 * Clone a canvas to a same-size new one. Public form of cloneTo, used
 * by the editor's undo system to snapshot the working state before a
 * destructive op.
 */
export function snapshotCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  return cloneTo(source);
}

/**
 * Render an image (or canvas) into a fresh HTMLCanvasElement at its
 * natural resolution with nearest-neighbor sampling. Used by the editor
 * to convert a loaded source HTMLImageElement into the working canvas.
 */
export function imageToCanvas(
  img: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
  }
  return c;
}

/**
 * Decode a Blob (PNG / WebP / etc.) into a fresh HTMLCanvasElement at
 * its natural resolution. Used to receive the output of ML bg removal
 * — the @imgly/background-removal API returns a Blob; we need a canvas
 * to swap into the editor's working surface.
 */
export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return imageToCanvas(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Convert canvas → base64 PNG (no data: prefix), used at save-time
 * just like the existing extractToPngBase64 but for a canvas instead
 * of an Image. Lives here next to the other ops so the editor's save
 * path is one import.
 */
export function canvasToPngBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("malformed data URL");
  return dataUrl.slice(comma + 1);
}
