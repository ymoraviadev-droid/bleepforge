import { useNavigate } from "react-router";

import type { ShaderAsset } from "../../lib/api";
import {
  buildShaderEditUrl,
  fmtBytes,
  shaderTypeLabel,
  shaderTypeStyle,
} from "./format";
import { PatternBackdrop, SHADER_PATTERN_DEFS, DEFAULT_SHADER_PATTERN } from "./patterns";

// Compact row equivalent of ShaderCard. Same affordances (click to view,
// "used by N" pill); narrower viewports hide softer columns (parentRel
// hidden below `sm:`, UID below `lg:`). Mirrors the AssetRow shape.

interface Props {
  asset: ShaderAsset;
  usageCount: number | null;
  onShowUsages: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function ShaderRow({ asset, usageCount, onShowUsages, onContextMenu }: Props) {
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
      onContextMenu={onContextMenu}
      title={`${asset.basename} — click to open · right-click for more`}
      className="group flex cursor-pointer items-center gap-3 border-2 border-neutral-800 bg-neutral-900 px-2 py-1.5 transition-colors hover:border-emerald-700 focus-visible:border-emerald-500 focus-visible:outline-none"
    >
      {/* Pattern swatch — small visual identity cue alongside the type
          label, so the user can spot a specific shader at a glance even
          in compact row view. */}
      <span
        className={`relative shrink-0 overflow-hidden border ${style.border} ${style.text} bg-neutral-950 size-5`}
        title={`pattern: ${SHADER_PATTERN_DEFS[asset.pattern ?? DEFAULT_SHADER_PATTERN].label}`}
        aria-hidden
      >
        <PatternBackdrop
          pattern={asset.pattern}
          opacity={0.55}
          className="absolute inset-0 size-full"
        />
      </span>
      <span
        className={`shrink-0 border px-1.5 font-mono text-[9px] uppercase tracking-wider ${style.border} ${style.text} bg-neutral-950`}
        title={`shader_type ${shaderTypeLabel(asset.shaderType)}`}
      >
        {shaderTypeLabel(asset.shaderType)}
      </span>
      <span
        className="shrink-0 border border-neutral-800 px-1 font-mono text-[9px] text-neutral-500"
        title={`${asset.uniformCount} uniform${asset.uniformCount === 1 ? "" : "s"}`}
      >
        {asset.uniformCount}u
      </span>
      <span
        className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-100"
        title={asset.basename}
      >
        {asset.basename}
      </span>
      {asset.parentRel && (
        <span
          className="hidden min-w-0 max-w-xs truncate font-mono text-[10px] text-emerald-500/80 sm:inline"
          title={asset.parentRel}
        >
          {asset.parentRel}
        </span>
      )}
      <span className="shrink-0 font-mono text-[10px] text-neutral-500">
        {fmtBytes(asset.sizeBytes)}
      </span>
      {asset.uid && (
        <span
          className="hidden shrink-0 truncate font-mono text-[10px] text-neutral-600 lg:inline"
          title={asset.uid}
          style={{ maxWidth: "10rem" }}
        >
          {asset.uid}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onShowUsages();
        }}
        className={`shrink-0 cursor-pointer border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
          usageCount === 0
            ? "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
            : "border-emerald-800 text-emerald-400 hover:border-emerald-600 hover:text-emerald-300"
        }`}
        title="Show every reference to this shader"
      >
        {usageCount === null
          ? "…"
          : usageCount === 0
            ? "unused"
            : `${usageCount}`}
      </button>
    </div>
  );
}
