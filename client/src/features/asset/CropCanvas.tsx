import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  clamp,
  constrainRect,
  cursorForHandle,
  hitTestHandle,
  normalizeAndClamp,
  pointInRect,
  resizeByHandle,
  snapTo,
  translateRect,
  type CropRect,
  type Handle,
} from "./cropMath";

// Pixel-perfect crop canvas — Godot AtlasTexture-style. Zoom is integer
// (1×, 2×, 4×, 8×, 16× by default) but we allow fractional fit-zooms so
// huge atlases still display in full. All persistent state (the crop
// rect) lives in source-pixel coordinates; canvas pixels are a render-
// time concern only.
//
// Interactions:
//   click+drag empty area → draw new rect (locked to source-pixel grid)
//   click+drag inside rect → move it
//   click+drag handle      → resize that edge / corner
//   wheel                  → pan
//   ctrl+wheel / pinch     → zoom centered on cursor
//   space+drag / middle    → pan
//   arrow keys (rect set)  → nudge by snap unit (default 1)
//   shift+arrow            → nudge by 8 source pixels
//   0                      → fit zoom
//   1 / 2 / 3 / 4          → 1× / 2× / 4× / 8× zoom
//   delete / esc           → clear crop rect

// Source the cropper draws from. Either an HTMLImageElement (loaded once
// for import) or an HTMLCanvasElement (for edit mode where ops like flip
// and bg-removal mutate the working surface). Both expose `naturalWidth`
// /`naturalHeight` for Image, `width`/`height` for Canvas — we pass the
// right pair via the dedicated `sourceWidth`/`sourceHeight` props so the
// component doesn't have to discriminate at runtime.
type CropSource = HTMLImageElement | HTMLCanvasElement;

interface Props {
  source: CropSource;
  /** Width of the source in source-pixels. */
  sourceWidth: number;
  /** Height of the source in source-pixels. */
  sourceHeight: number;
  crop: CropRect | null;
  onCropChange: (next: CropRect | null) => void;
  /** Source-pixel snap unit. 1 = no snap. */
  snap: number;
  /** Display size of the canvas in CSS pixels. */
  width: number;
  height: number;
  /** Optional eyedropper hook — when set, clicks on the source-pixel grid
   *  call this instead of starting a crop drag. Used by the bg-remove
   *  tool's "click to sample bg color" mode. */
  onSamplePixel?: (x: number, y: number) => void;
}

interface DragState {
  mode: "draw" | "move" | "handle" | "pan";
  startCssX: number;
  startCssY: number;
  // For "draw": the anchor in source coords.
  startSourceX: number;
  startSourceY: number;
  // For "move" / "handle" / "pan": snapshot of the relevant base state.
  baseRect?: CropRect;
  basePan?: { x: number; y: number };
  handle?: Handle;
}

// Half-size (in source pixels) of the handle hit-test square. 1.5 means
// each handle occupies a 3×3 source-px area — generous enough to grab at
// any zoom but tight enough that handles don't overlap on small rects.
const HANDLE_HIT_HALF = 1.5;

// Visual handle size in canvas pixels. 8×8 reads clearly without
// occluding the underlying image at typical zooms.
const HANDLE_VISUAL_SIZE = 8;

export function CropCanvas({
  source,
  sourceWidth: imgW,
  sourceHeight: imgH,
  crop,
  onCropChange,
  snap,
  width,
  height,
  onSamplePixel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverHandle, setHoverHandle] = useState<Handle | null>(null);
  const [hoverSource, setHoverSource] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [spaceDown, setSpaceDown] = useState(false);

  // --- Coordinate helpers (closures over zoom/pan; cheap to recreate) ---
  const sourceFromCss = useCallback(
    (cssX: number, cssY: number): { x: number; y: number } => ({
      x: (cssX - pan.x) / zoom,
      y: (cssY - pan.y) / zoom,
    }),
    [pan, zoom],
  );

  // --- Auto-fit zoom on first load + image change ---
  useLayoutEffect(() => {
    if (!imgW || !imgH) return;
    const fitW = (width * 0.92) / imgW;
    const fitH = (height * 0.92) / imgH;
    let z = Math.min(fitW, fitH);
    // Snap to a clean power-of-2 when the image is small enough to scale
    // up — pixel art reads best at integer multiples.
    if (z >= 1) {
      const pow = Math.floor(Math.log2(z));
      z = Math.pow(2, clamp(pow, 0, 5));
    } else {
      // Below 1×, don't snap — large atlases need fractional fit zooms
      // and a 1/2 step is a big jump.
      z = Math.max(z, 1 / 32);
    }
    setZoom(z);
    setPan({
      x: (width - imgW * z) / 2,
      y: (height - imgH * z) / 2,
    });
  }, [imgW, imgH, width, height]);

  // --- Drawing ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr) canvas.width = width * dpr;
    if (canvas.height !== height * dpr) canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Background.
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // Checkered pattern under the image area only (helps spot transparency).
    drawChecker(ctx, pan.x, pan.y, imgW * zoom, imgH * zoom);

    // Image. Disabling smoothing on the context isn't always honored when
    // drawImage upscales — set the same flag on the canvas-level method.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, pan.x, pan.y, imgW * zoom, imgH * zoom);

    // Border around the image bounds so the user can see where pixels end.
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.floor(pan.x) + 0.5,
      Math.floor(pan.y) + 0.5,
      Math.round(imgW * zoom),
      Math.round(imgH * zoom),
    );

    // Outside-crop dimming + crop rect.
    if (crop) {
      const rx = pan.x + crop.x * zoom;
      const ry = pan.y + crop.y * zoom;
      const rw = crop.w * zoom;
      const rh = crop.h * zoom;

      // Dim the entire visible canvas, then punch out the crop.
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.rect(rx, ry, rw, rh);
      ctx.fill("evenodd");

      // Crop border (emerald, 2px so it reads against most images).
      ctx.strokeStyle = "#10b981"; // emerald-500
      ctx.lineWidth = 2;
      ctx.strokeRect(
        Math.round(rx) + 1,
        Math.round(ry) + 1,
        Math.round(rw) - 2,
        Math.round(rh) - 2,
      );

      // Handles — 8×8 squares at corners + edge midpoints.
      const half = HANDLE_VISUAL_SIZE / 2;
      const handlePoints: { handle: Handle; x: number; y: number }[] = [
        { handle: "tl", x: rx, y: ry },
        { handle: "t", x: rx + rw / 2, y: ry },
        { handle: "tr", x: rx + rw, y: ry },
        { handle: "l", x: rx, y: ry + rh / 2 },
        { handle: "r", x: rx + rw, y: ry + rh / 2 },
        { handle: "bl", x: rx, y: ry + rh },
        { handle: "b", x: rx + rw / 2, y: ry + rh },
        { handle: "br", x: rx + rw, y: ry + rh },
      ];
      for (const p of handlePoints) {
        ctx.fillStyle =
          hoverHandle === p.handle ? "#34d399" : "#10b981"; // emerald-400 / 500
        ctx.fillRect(
          Math.round(p.x - half),
          Math.round(p.y - half),
          HANDLE_VISUAL_SIZE,
          HANDLE_VISUAL_SIZE,
        );
        ctx.strokeStyle = "#022c22"; // emerald-950
        ctx.lineWidth = 1;
        ctx.strokeRect(
          Math.round(p.x - half) + 0.5,
          Math.round(p.y - half) + 0.5,
          HANDLE_VISUAL_SIZE - 1,
          HANDLE_VISUAL_SIZE - 1,
        );
      }
    }

    // Cursor pixel readout — bottom-left corner. Reads "x:32 y:16" in
    // source-pixel coords, useful for aligning crops to known atlas
    // grids ("the second tile starts at x=32").
    if (hoverSource) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, height - 18, 120, 18);
      ctx.fillStyle = "#a3a3a3"; // neutral-400
      ctx.font = "11px monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `x:${Math.floor(hoverSource.x)} y:${Math.floor(hoverSource.y)}`,
        6,
        height - 9,
      );
    }
  }, [crop, hoverHandle, hoverSource, source, imgH, imgW, pan, zoom, width, height]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  // --- Pointer handlers ---
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    // Pan: middle-mouse, or space-held + left-click.
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({
        mode: "pan",
        startCssX: cssX,
        startCssY: cssY,
        startSourceX: 0,
        startSourceY: 0,
        basePan: { ...pan },
      });
      return;
    }
    if (e.button !== 0) return;

    const src = sourceFromCss(cssX, cssY);

    // Eyedropper mode (bg-remove tool's color sampler). When the host
    // wires onSamplePixel, clicks on a valid source-pixel call it
    // instead of starting a crop drag — short-circuit before the rest
    // of the handler runs. Right-click (button !== 0) above is already
    // filtered, so this only catches genuine left-clicks.
    if (onSamplePixel) {
      const sx = Math.floor(src.x);
      const sy = Math.floor(src.y);
      if (sx >= 0 && sy >= 0 && sx < imgW && sy < imgH) {
        onSamplePixel(sx, sy);
        return;
      }
    }

    // Handle resize takes priority over move when the click lands on a
    // handle inside an existing crop.
    if (crop) {
      const handle = hitTestHandle(crop, src.x, src.y, HANDLE_HIT_HALF);
      if (handle) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDrag({
          mode: "handle",
          startCssX: cssX,
          startCssY: cssY,
          startSourceX: src.x,
          startSourceY: src.y,
          baseRect: { ...crop },
          handle,
        });
        return;
      }
      if (pointInRect(crop, src.x, src.y)) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDrag({
          mode: "move",
          startCssX: cssX,
          startCssY: cssY,
          startSourceX: src.x,
          startSourceY: src.y,
          baseRect: { ...crop },
        });
        return;
      }
    }

    // Otherwise: start drawing a new crop, anchored at the snapped
    // source-pixel under the cursor.
    const ax = clamp(snapTo(src.x, snap), 0, imgW);
    const ay = clamp(snapTo(src.y, snap), 0, imgH);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({
      mode: "draw",
      startCssX: cssX,
      startCssY: cssY,
      startSourceX: ax,
      startSourceY: ay,
    });
    onCropChange(null); // clear any existing crop while drawing fresh
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const src = sourceFromCss(cssX, cssY);
    setHoverSource(src);

    // Hover-handle highlight (only when not actively dragging — during a
    // drag the cursor mode is fixed).
    if (!drag && crop) {
      setHoverHandle(hitTestHandle(crop, src.x, src.y, HANDLE_HIT_HALF));
    } else if (!drag) {
      setHoverHandle(null);
    }

    if (!drag) return;

    if (drag.mode === "pan" && drag.basePan) {
      setPan({
        x: drag.basePan.x + (cssX - drag.startCssX),
        y: drag.basePan.y + (cssY - drag.startCssY),
      });
      return;
    }

    if (drag.mode === "draw") {
      const sx = clamp(snapTo(src.x, snap), 0, imgW);
      const sy = clamp(snapTo(src.y, snap), 0, imgH);
      const next = normalizeAndClamp(
        drag.startSourceX,
        drag.startSourceY,
        sx,
        sy,
        imgW,
        imgH,
      );
      onCropChange(next);
      return;
    }

    if (drag.mode === "move" && drag.baseRect) {
      const dxRaw = src.x - drag.startSourceX;
      const dyRaw = src.y - drag.startSourceY;
      const dx = snapTo(dxRaw, snap);
      const dy = snapTo(dyRaw, snap);
      onCropChange(translateRect(drag.baseRect, dx, dy, imgW, imgH));
      return;
    }

    if (drag.mode === "handle" && drag.baseRect && drag.handle) {
      const sx = snapTo(src.x, snap);
      const sy = snapTo(src.y, snap);
      onCropChange(
        resizeByHandle(drag.baseRect, drag.handle, sx, sy, imgW, imgH),
      );
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      setDrag(null);
    }
  };

  const onPointerLeave = () => {
    setHoverSource(null);
    setHoverHandle(null);
  };

  // --- Wheel: pan by default, ctrl+wheel zooms centered on cursor ---
  // React 19 still fires onWheel as a passive listener in some cases —
  // bind via DOM directly so we can preventDefault() without warnings.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      // Plain wheel = zoom centered on cursor (no modifier needed).
      // Pan is via middle-mouse drag or space+drag — separate input
      // surfaces, no fight with vertical scrolling. Wheel-up zooms in;
      // step factor of ~1.0015^(-dy) gives a smooth, natural feel.
      const factor = Math.pow(1.0015, -e.deltaY);
      const newZoom = clamp(zoom * factor, 1 / 32, 32);
      setZoomAtCursor(newZoom, cssX, cssY);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
    // setZoomAtCursor is a closure over zoom/pan and is recreated each
    // render — but we want a stable handler bound once. So pull the math
    // inline rather than depending on an outer function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan]);

  function setZoomAtCursor(newZoom: number, cssX: number, cssY: number) {
    const sourceX = (cssX - pan.x) / zoom;
    const sourceY = (cssY - pan.y) / zoom;
    setPan({
      x: cssX - sourceX * newZoom,
      y: cssY - sourceY * newZoom,
    });
    setZoom(newZoom);
  }

  // --- Keyboard: arrows nudge crop, digits change zoom, esc/del clears ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && !spaceDown) {
        setSpaceDown(true);
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!crop) return;
      const step = e.shiftKey ? 8 : Math.max(1, snap);
      let nx = crop.x;
      let ny = crop.y;
      let nw = crop.w;
      let nh = crop.h;
      let consumed = true;
      if (e.key === "ArrowLeft") {
        if (e.altKey) nw = Math.max(1, nw - step);
        else nx -= step;
      } else if (e.key === "ArrowRight") {
        if (e.altKey) nw += step;
        else nx += step;
      } else if (e.key === "ArrowUp") {
        if (e.altKey) nh = Math.max(1, nh - step);
        else ny -= step;
      } else if (e.key === "ArrowDown") {
        if (e.altKey) nh += step;
        else ny += step;
      } else if (e.key === "Escape" || e.key === "Delete") {
        onCropChange(null);
        return;
      } else {
        consumed = false;
      }
      if (consumed) {
        e.preventDefault();
        onCropChange(constrainRect({ x: nx, y: ny, w: nw, h: nh }, imgW, imgH));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [crop, snap, spaceDown, imgW, imgH, onCropChange]);

  const cursorStyle = useMemo(() => {
    if (drag?.mode === "pan") return "grabbing";
    if (drag?.mode === "handle" && drag.handle) return cursorForHandle(drag.handle);
    if (drag?.mode === "move") return "move";
    if (drag?.mode === "draw") return "crosshair";
    if (spaceDown) return "grab";
    // Eyedropper mode wins over crop interactions — when the host wired
    // onSamplePixel, every left-click samples and we want the visual to
    // match.
    if (onSamplePixel) return "crosshair";
    if (hoverHandle) return cursorForHandle(hoverHandle);
    if (
      crop &&
      hoverSource &&
      pointInRect(crop, hoverSource.x, hoverSource.y)
    ) {
      return "move";
    }
    return "crosshair";
  }, [drag, hoverHandle, hoverSource, crop, spaceDown, onSamplePixel]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Crop preview canvas"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
      style={{ width, height, cursor: cursorStyle, touchAction: "none" }}
      className="relative select-none border-2 border-neutral-800 bg-neutral-950"
    >
      <canvas
        ref={canvasRef}
        style={{ width, height, display: "block" }}
        aria-hidden="true"
      />
      {/* Zoom controls overlaid in the top-right of the canvas. Keeps
          them visible during fullscreen-style modal use without eating
          space in the side panel. */}
      <div className="absolute right-2 top-2 flex items-center gap-1 border border-neutral-700 bg-neutral-950/90 px-1 py-0.5">
        <ZoomButton
          onClick={() =>
            setZoomAtCursor(zoom * 0.5, width / 2, height / 2)
          }
          title="Zoom out"
        >
          −
        </ZoomButton>
        <span className="font-mono text-[10px] text-neutral-300">
          {fmtZoom(zoom)}
        </span>
        <ZoomButton
          onClick={() =>
            setZoomAtCursor(zoom * 2, width / 2, height / 2)
          }
          title="Zoom in"
        >
          +
        </ZoomButton>
        <ZoomButton onClick={() => fitView()} title="Fit / 0">
          ⤡
        </ZoomButton>
      </div>
    </div>
  );

  function fitView() {
    const fitW = (width * 0.92) / imgW;
    const fitH = (height * 0.92) / imgH;
    let z = Math.min(fitW, fitH);
    if (z >= 1) {
      const pow = Math.floor(Math.log2(z));
      z = Math.pow(2, clamp(pow, 0, 5));
    } else {
      z = Math.max(z, 1 / 32);
    }
    setZoom(z);
    setPan({
      x: (width - imgW * z) / 2,
      y: (height - imgH * z) / 2,
    });
  }
}

function ZoomButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="size-5 border border-neutral-800 bg-neutral-900 font-mono text-xs text-neutral-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
    >
      {children}
    </button>
  );
}

function fmtZoom(z: number): string {
  if (z >= 1) return `${Math.round(z * 100) / 100}×`;
  return `1/${Math.round(1 / z)}×`;
}

function drawChecker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const cell = 8;
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#1a1a1a";
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) continue;
      ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
    }
  }
  ctx.restore();
}

// Re-export the row of preset zoom values for the controls panel. Kept
// here (next to the canvas) since the canvas is the source of truth on
// what it can render cleanly.
export const ZOOM_PRESETS: readonly number[] = [
  1 / 8,
  1 / 4,
  1 / 2,
  1,
  2,
  4,
  8,
  16,
];
