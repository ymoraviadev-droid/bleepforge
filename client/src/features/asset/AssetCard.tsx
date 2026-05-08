import type { ImageAsset } from "../../lib/api";
import { assetUrl } from "../../lib/api";
import { CHECKER_STYLE, fmtBytes, fmtDims } from "./format";

// Card view for one image. Big thumbnail on top, metadata + actions below.
// Pixel-rendered preview (the corpus is pixel-art); checkered bg so
// transparent pixels are obvious; click "used by N" to open the drawer.

interface Props {
  asset: ImageAsset;
  /** N references found, or null if not yet computed (lazy — drawer
   *  triggers compute, this just shows the count if cached). */
  usageCount: number | null;
  onShowUsages: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function AssetCard({ asset, usageCount, onShowUsages, onContextMenu }: Props) {
  return (
    <div
      onContextMenu={onContextMenu}
      className="group flex flex-col border-2 border-neutral-800 bg-neutral-900 transition-colors hover:border-emerald-700"
    >
      <div
        className="relative flex h-32 items-center justify-center overflow-hidden"
        style={CHECKER_STYLE}
      >
        <img
          src={assetUrl(asset.path)}
          alt=""
          title={asset.path}
          className="max-h-full max-w-full object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="absolute right-1 top-1 border border-neutral-700 bg-neutral-950/80 px-1 font-mono text-[9px] uppercase tracking-wider text-neutral-300">
          {asset.format}
        </span>
      </div>

      <div className="flex min-h-0 flex-col gap-1 border-t-2 border-neutral-800 p-2">
        <div
          className="truncate font-mono text-xs text-neutral-100"
          title={asset.basename}
        >
          {asset.basename}
        </div>
        {asset.parentRel && (
          <div
            className="truncate font-mono text-[10px] text-emerald-500/80"
            title={asset.parentRel}
          >
            {asset.parentRel}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-neutral-500">
          <span title="pixel dimensions">{fmtDims(asset.width, asset.height)}</span>
          <span className="text-neutral-700">·</span>
          <span title="file size">{fmtBytes(asset.sizeBytes)}</span>
          {asset.uid && (
            <>
              <span className="text-neutral-700">·</span>
              <span
                className="truncate"
                title={asset.uid}
                style={{ maxWidth: "8rem" }}
              >
                {asset.uid}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onShowUsages();
          }}
          className={`mt-1 w-fit border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            usageCount === 0
              ? "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
              : "border-emerald-800 text-emerald-400 hover:border-emerald-600 hover:text-emerald-300"
          }`}
          title="Show every reference to this image"
        >
          {usageCount === null
            ? "used by …"
            : usageCount === 0
              ? "unused"
              : `used by ${usageCount}`}
        </button>
      </div>
    </div>
  );
}
