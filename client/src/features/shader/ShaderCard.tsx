import { useNavigate } from "react-router";

import type { ShaderAsset } from "../../lib/api";
import {
  buildShaderEditUrl,
  fmtBytes,
  SCANLINE_OVERLAY_STYLE,
  shaderTypeLabel,
  shaderTypeStyle,
} from "./format";

// Card view for one shader. Top area is a tinted backdrop (color comes
// from shader_type) with a scanline overlay — sells "this is a shader,
// not generic content" before the user reads the basename. Phase 3 will
// replace this with a live WebGL preview of the shader running on the
// default UV-grid test image; Phase 1 keeps it simple and informative.
//
// Click navigates to the view-only edit page. Right-click is intentionally
// skipped for Phase 1 — Phase 2 will add Edit / Duplicate / Delete.

interface Props {
  asset: ShaderAsset;
  /** N references found, or null if not yet computed. */
  usageCount: number | null;
  /** Click on the "used by N" pill — independent affordance from the card. */
  onShowUsages: () => void;
}

export function ShaderCard({ asset, usageCount, onShowUsages }: Props) {
  const navigate = useNavigate();
  const style = shaderTypeStyle(asset.shaderType);
  const href = buildShaderEditUrl(asset.path);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(href);
        }
      }}
      title={`${asset.basename} — click to view source`}
      className="group flex cursor-pointer flex-col border-2 border-neutral-800 bg-neutral-900 transition-colors hover:border-emerald-700 focus-visible:border-emerald-500 focus-visible:outline-none"
    >
      <div
        className={`relative flex h-24 items-center justify-center overflow-hidden border-b border-neutral-800 ${style.bg}`}
      >
        <div className="absolute inset-0" style={SCANLINE_OVERLAY_STYLE} />
        <span
          className={`relative z-10 font-display text-[11px] uppercase tracking-wider ${style.text}`}
        >
          {shaderTypeLabel(asset.shaderType)}
        </span>
        <span
          className={`absolute right-1 top-1 z-10 border px-1 font-mono text-[9px] uppercase tracking-wider ${style.border} bg-neutral-950/80 ${style.text}`}
          title={`${asset.uniformCount} uniform${asset.uniformCount === 1 ? "" : "s"}`}
        >
          {asset.uniformCount}u
        </span>
      </div>

      <div className="flex min-h-0 flex-col gap-1 p-2">
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
            // stopPropagation so the parent card's onClick doesn't fire
            // and navigate away — the pill is its own affordance.
            e.stopPropagation();
            onShowUsages();
          }}
          className={`mt-1 w-fit cursor-pointer border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            usageCount === 0
              ? "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
              : "border-emerald-800 text-emerald-400 hover:border-emerald-600 hover:text-emerald-300"
          }`}
          title="Show every reference to this shader"
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
