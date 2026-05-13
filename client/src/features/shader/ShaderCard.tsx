import { useNavigate } from "react-router";

import type { ShaderAsset } from "../../lib/api";
import {
  buildShaderEditUrl,
  fmtBytes,
  shaderCardStyle,
  shaderDisplayName,
  shaderTypeLabel,
} from "./format";
import { PatternBackdrop } from "./patterns";

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
  /** Right-click handler. List page wires up the shader context menu
   *  (Open / Duplicate / Delete); other surfaces (none yet, but
   *  symmetric with the asset card prop) can omit. */
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function ShaderCard({ asset, usageCount, onShowUsages, onContextMenu }: Props) {
  const navigate = useNavigate();
  const style = shaderCardStyle(asset);
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
      onContextMenu={onContextMenu}
      title={`${asset.basename} — click to open · right-click for more`}
      className="card-lift group flex cursor-pointer flex-col border-2 border-neutral-800 bg-neutral-900 hover:border-emerald-700 focus-visible:border-emerald-500 focus-visible:outline-none"
    >
      <div
        className={`relative flex h-24 items-center justify-center overflow-hidden border-b border-neutral-800 ${style.bg} ${style.text}`}
      >
        {/* Per-shader card pattern (Bleepforge-only visual identity).
            currentColor on the SVG pattern resolves to the shader_type
            text class on the parent — keeps the type-tint cue while
            varying the shape per shader. */}
        <PatternBackdrop pattern={asset.pattern} className="absolute inset-0 size-full" />
        {/* Headline label = the shader's name (basename without
            .gdshader). The tint color already encodes shader_type;
            putting "canvas_item" here on every canvas_item shader was
            redundant noise. Small corner chips below carry type +
            uniform count for users who want the metadata at a glance. */}
        <span
          className={`relative z-10 max-w-[90%] truncate px-3 text-center font-display text-sm uppercase tracking-wider ${style.text}`}
          title={asset.basename}
        >
          {shaderDisplayName(asset.basename)}
        </span>
        <span
          className={`absolute left-1 top-1 z-10 border px-1 font-mono text-[9px] uppercase tracking-wider ${style.border} bg-neutral-950/80 ${style.text}`}
          title={`shader_type ${shaderTypeLabel(asset.shaderType)}`}
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
