import { useEffect, useState } from "react";
import { Link } from "react-router";

import type { AssetUsage, AssetUsageDomain, ImageAsset } from "../../lib/api";
import { assetsApi, assetUrl } from "../../lib/api";
import { CHECKER_STYLE, fmtBytes, fmtDims } from "./format";

// Side drawer that opens when the user clicks a "used by N" pill on a
// card or row. Lists every reference (.tres + JSON) and gives a clickable
// link back to the relevant edit page.

interface Props {
  asset: ImageAsset;
  onClose: () => void;
}

export function UsagesDrawer({ asset, onClose }: Props) {
  const [usages, setUsages] = useState<AssetUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUsages(null);
    setError(null);
    assetsApi
      .usages(asset.path)
      .then((r) => setUsages(r.usages))
      .catch((e) => setError(String(e)));
  }, [asset.path]);

  // Close on Escape, mirroring Modal.tsx's interaction model.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Usages of ${asset.basename}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l-2 border-neutral-800 bg-neutral-950"
      >
        <header className="flex shrink-0 items-start gap-3 border-b-2 border-neutral-800 p-3">
          <div
            className="flex size-16 shrink-0 items-center justify-center overflow-hidden border border-neutral-800"
            style={CHECKER_STYLE}
          >
            <img
              src={assetUrl(asset.path)}
              alt=""
              className="max-h-full max-w-full object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-mono text-sm text-neutral-100"
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
            <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10px] text-neutral-500">
              <span>{fmtDims(asset.width, asset.height)}</span>
              <span className="text-neutral-700">·</span>
              <span>{fmtBytes(asset.sizeBytes)}</span>
              <span className="text-neutral-700">·</span>
              <span className="uppercase">{asset.format}</span>
            </div>
            {asset.uid && (
              <div
                className="mt-0.5 truncate font-mono text-[10px] text-neutral-600"
                title={asset.uid}
              >
                {asset.uid}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 border border-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && (
            <p className="font-mono text-xs text-red-400">Error: {error}</p>
          )}
          {!error && usages === null && (
            <p className="font-mono text-xs text-neutral-500">Searching…</p>
          )}
          {!error && usages && usages.length === 0 && (
            <p className="font-mono text-xs text-neutral-500">
              Not referenced by any .tres or Bleepforge JSON. Safe to delete
              from Godot's FileSystem dock if you don't need it.
            </p>
          )}
          {!error && usages && usages.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {usages.map((u, i) => (
                <UsageItem key={`${u.kind}:${u.file}:${i}`} usage={u} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

function UsageItem({ usage }: { usage: AssetUsage }) {
  const target = routeFor(usage.domain, usage.key);
  const { label: kindLabel, class: kindClass } = badgeForKind(usage.kind);
  const inner = (
    <div className="flex flex-col gap-0.5 border-2 border-neutral-800 bg-neutral-900 p-2 transition-colors group-hover:border-emerald-700">
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 border px-1 font-mono text-[9px] uppercase tracking-wider ${kindClass}`}
        >
          {kindLabel}
        </span>
        {usage.domain && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
            {usage.domain}
          </span>
        )}
        {usage.key && (
          <span
            className="truncate font-mono text-xs text-neutral-100"
            title={usage.key}
          >
            {usage.key}
          </span>
        )}
      </div>
      <div
        className="truncate font-mono text-[10px] text-neutral-500"
        title={usage.snippet}
      >
        {usage.snippet}
      </div>
      <div
        className="truncate font-mono text-[9px] text-neutral-700"
        title={usage.file}
      >
        {usage.file}
      </div>
    </div>
  );
  if (!target) return <li>{inner}</li>;
  return (
    <li>
      <Link to={target} className="group block">
        {inner}
      </Link>
    </li>
  );
}

// Kind → badge style. Three categories, three colors:
//   - .tres   amber (Godot resource — most common, the .tres scan picks up
//             items / npcs / quests / dialogs / etc. through their files)
//   - .tscn   cyan  (Godot scene — scenes are not editable in Bleepforge,
//             so these refs are non-clickable; cyan signals "different
//             surface" without crowding amber/emerald)
//   - json    emerald (Bleepforge-only doc — currently just concept;
//             always paired with the "concept" domain tag right next to
//             it, so the combination "json + concept" reads as
//             "Bleepforge-specific concept reference" without needing a
//             standalone "Bleepforge" badge)
function badgeForKind(kind: AssetUsage["kind"]): { label: string; class: string } {
  switch (kind) {
    case "tres":
      return { label: ".tres", class: "border-amber-800 text-amber-400" };
    case "tscn":
      return { label: ".tscn", class: "border-cyan-800 text-cyan-400" };
    case "json":
      return { label: "json", class: "border-emerald-800 text-emerald-400" };
  }
}

function routeFor(
  domain: AssetUsageDomain | null,
  key: string | null,
): string | null {
  if (!domain) return null;
  if (domain === "concept") return "/concept/edit";
  if (!key) return null;
  switch (domain) {
    case "item":
      return `/items/${encodeURIComponent(key)}`;
    case "quest":
      return `/quests/${encodeURIComponent(key)}`;
    case "karma":
      return `/karma/${encodeURIComponent(key)}`;
    case "npc":
      return `/npcs/${encodeURIComponent(key)}`;
    case "faction":
      return `/factions/${encodeURIComponent(key)}`;
    case "dialog": {
      const [folder, id] = splitFolderKey(key);
      if (!folder || !id) return null;
      return `/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
    }
    case "balloon": {
      const [folder, basename] = splitFolderKey(key);
      if (!folder || !basename) return null;
      return `/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(basename)}`;
    }
  }
}

function splitFolderKey(key: string): [string | null, string | null] {
  const idx = key.indexOf("/");
  if (idx <= 0) return [null, null];
  return [key.slice(0, idx), key.slice(idx + 1)];
}
