import type { ImageAsset } from "../../lib/api";
import { assetUrl } from "../../lib/api";
import { CHECKER_STYLE, fmtBytes, fmtDims } from "./format";

// Compact single-line view of an image. Same data as the card, narrower.
// Hides softer columns (uid, format) at smaller breakpoints.

interface Props {
  asset: ImageAsset;
  usageCount: number | null;
  onShowUsages: () => void;
  onPreview: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function AssetRow({
  asset,
  usageCount,
  onShowUsages,
  onPreview,
  onContextMenu,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPreview}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview();
        }
      }}
      onContextMenu={onContextMenu}
      title="Click to preview · Right-click for Edit / Duplicate / Delete"
      className="flex cursor-pointer items-center gap-3 border-2 border-neutral-800 bg-neutral-900 px-2 py-1.5 transition-colors hover:border-emerald-700 focus-visible:border-emerald-500 focus-visible:outline-none"
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden"
        style={CHECKER_STYLE}
      >
        <img
          src={assetUrl(asset.path)}
          alt=""
          title={asset.path}
          className="max-h-full max-w-full object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <div className="min-w-0 flex-1">
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
      </div>
      <div className="hidden shrink-0 font-mono text-[10px] text-neutral-500 sm:block">
        {fmtDims(asset.width, asset.height)}
      </div>
      <div className="hidden shrink-0 font-mono text-[10px] text-neutral-500 lg:block">
        {fmtBytes(asset.sizeBytes)}
      </div>
      <div className="hidden shrink-0 font-mono text-[9px] uppercase tracking-wider text-neutral-500 lg:block">
        {asset.format}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          // Same dual-affordance trick as AssetCard: stopPropagation
          // so this pill's click doesn't also trigger the row's
          // open-editor handler.
          e.stopPropagation();
          onShowUsages();
        }}
        className={`shrink-0 cursor-pointer border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
          usageCount === 0
            ? "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
            : "border-emerald-800 text-emerald-400 hover:border-emerald-600 hover:text-emerald-300"
        }`}
      >
        {usageCount === null
          ? "used by …"
          : usageCount === 0
            ? "unused"
            : `used by ${usageCount}`}
      </button>
    </div>
  );
}
