import { useEffect, useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { EmptyState, WorkshopEmpty } from "../../components/EmptyState";
import {
  CARDS_LIST_OPTIONS,
  useViewMode,
  ViewToggle,
} from "../../components/ViewToggle";
import type { ImageAsset } from "../../lib/api";
import { assetsApi } from "../../lib/api";
import { useAssetRefresh } from "../../lib/assets/useAssetRefresh";
import { useSyncRefresh } from "../../lib/sync/useSyncRefresh";
import { textInput } from "../../styles/classes";
import { AssetCard } from "./AssetCard";
import { AssetRow } from "./AssetRow";
import { showImageEditor } from "./imageEditorHost";
import { UsagesDrawer } from "./UsagesDrawer";
import { makeAssetContextMenuHandler } from "./useAssetMenu";

// Image gallery — Phase 1 of the assets work. Browses every image found
// under the Godot project, with a "used by N" reverse-lookup pill that
// opens a drawer listing every .tres / JSON reference. The unique value
// here is the cross-system search: Godot can't easily answer "where is
// eddie-portrait2.png used?" because Bleepforge's JSON cache holds half
// the references.
//
// Audio (Phase 2) and import + crop (Phase 3) will land as additional
// tabs on this page; for now the route is image-only.

type SortBy = "name" | "folder" | "size" | "mtime";
type GroupBy = "folder" | "format" | "none";

const SORT_LABEL: Record<SortBy, string> = {
  name: "name",
  folder: "folder",
  size: "size",
  mtime: "modified",
};

const GROUP_LABEL: Record<GroupBy, string> = {
  folder: "folder",
  format: "format",
  none: "none",
};

interface Group {
  id: string;
  label: string;
  items: ImageAsset[];
}

export function AssetList() {
  const [images, setImages] = useState<ImageAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("folder");
  const [groupBy, setGroupBy] = useState<GroupBy>("folder");
  const [view, setView] = useViewMode("asset");
  const [drawerAsset, setDrawerAsset] = useState<ImageAsset | null>(null);
  // Cached usage counts so the pills stop saying "…" once the drawer has
  // been opened for an asset. Lazily filled — opening the drawer for one
  // image populates that asset's count; the rest stay null until viewed.
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    assetsApi
      .listImages()
      .then((r) => setImages(r.images))
      .catch((e) => setError(String(e)));
  }, []);

  // Eager "used by N" counts. Single round trip on page load + a refresh
  // whenever an image, .tres, or JSON changes (any of which can shift a
  // count). Server does an inverted-pass scan over .tres / .tscn / JSON
  // so this answers "what's referenced where" including scene usage,
  // not just resource files.
  const refreshUsageCounts = () => {
    assetsApi
      .usageCounts()
      .then(setUsageCounts)
      .catch(() => {
        // Non-fatal — pills just stay at "…" until next refresh.
      });
  };
  useEffect(() => {
    refreshUsageCounts();
  }, []);
  useAssetRefresh(refreshUsageCounts);
  useSyncRefresh({ domain: "npc", onChange: refreshUsageCounts });
  useSyncRefresh({ domain: "item", onChange: refreshUsageCounts });
  useSyncRefresh({ domain: "faction", onChange: refreshUsageCounts });
  useSyncRefresh({ domain: "dialog", onChange: refreshUsageCounts });
  useSyncRefresh({ domain: "balloon", onChange: refreshUsageCounts });
  useSyncRefresh({ domain: "quest", onChange: refreshUsageCounts });
  useSyncRefresh({ domain: "karma", onChange: refreshUsageCounts });

  useAssetRefresh((event) => {
    // A single image changed on disk — refetch the full list. Cheap
    // (server holds it in memory), and avoids merging delta logic with
    // the filter chain. If the changed asset is currently open in the
    // drawer, refetch its usages too (the inner UsagesDrawer's effect
    // re-runs on its own when the asset object identity changes, so we
    // just need to set a fresh reference).
    assetsApi
      .listImages()
      .then((r) => {
        setImages(r.images);
        if (drawerAsset && event.path === drawerAsset.path) {
          const updated = r.images.find((i) => i.path === event.path);
          if (updated) setDrawerAsset(updated);
        }
      })
      .catch(() => {});
  });

  // Snappy refetch the moment the editor saves — fires ~150ms before
  // the watcher's debounced asset event reaches us, so the gallery
  // updates instantly when you hit Save in the editor instead of a
  // beat later. The watcher path above still runs for any other disk
  // change (saved in Aseprite/Krita externally, etc.).
  useEffect(() => {
    const onSaved = () => {
      assetsApi
        .listImages()
        .then((r) => setImages(r.images))
        .catch(() => {});
    };
    window.addEventListener("Bleepforge:image-saved", onSaved);
    return () => window.removeEventListener("Bleepforge:image-saved", onSaved);
  }, []);

  // Folder dropdown options — every parentRel that contains at least one
  // image, with a count, sorted alphabetically.
  const folderOptions = useMemo(() => {
    if (!images) return [];
    const counts = new Map<string, number>();
    for (const img of images) {
      counts.set(img.parentRel, (counts.get(img.parentRel) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [images]);

  // Format dropdown — only formats actually present, with counts.
  const formatOptions = useMemo(() => {
    if (!images) return [];
    const counts = new Map<string, number>();
    for (const img of images) {
      counts.set(img.format, (counts.get(img.format) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [images]);

  const filteredAndSorted = useMemo(() => {
    if (!images) return null;
    const q = search.toLowerCase().trim();
    const filtered = images.filter((img) => {
      if (folderFilter && img.parentRel !== folderFilter) return false;
      if (formatFilter && img.format !== formatFilter) return false;
      // "Orphans only" is a best-effort filter — only assets we've already
      // probed via the drawer have a known usage count, so this filter is
      // a soft hint rather than a guarantee. Useful once the user has
      // surveyed the project; until then it just shows known-orphans.
      if (orphansOnly && usageCounts[img.path] !== 0) return false;
      if (!q) return true;
      return (
        img.basename.toLowerCase().includes(q) ||
        img.parentRel.toLowerCase().includes(q) ||
        (img.uid?.toLowerCase().includes(q) ?? false)
      );
    });
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.basename.localeCompare(b.basename);
        case "folder":
          return (
            a.parentRel.localeCompare(b.parentRel) ||
            a.basename.localeCompare(b.basename)
          );
        case "size":
          return b.sizeBytes - a.sizeBytes;
        case "mtime":
          return b.mtimeMs - a.mtimeMs;
      }
    });
  }, [images, search, folderFilter, formatFilter, orphansOnly, sortBy, usageCounts]);

  const renderGroups = useMemo<Group[] | null>(() => {
    if (!filteredAndSorted) return null;
    if (groupBy === "none") {
      return [{ id: "all", label: "", items: filteredAndSorted }];
    }
    const buckets = new Map<string, ImageAsset[]>();
    for (const img of filteredAndSorted) {
      const k = groupBy === "folder" ? img.parentRel : img.format;
      const list = buckets.get(k) ?? [];
      list.push(img);
      buckets.set(k, list);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, items]) => ({ id: k, label: k || "(root)", items }));
  }, [filteredAndSorted, groupBy]);

  const handleShowUsages = async (asset: ImageAsset) => {
    setDrawerAsset(asset);
    // Prime the usage count cache as a side effect. The drawer fetches on
    // its own but we want the pill on the card to update too, so we do
    // our own quick fetch and stash the count.
    try {
      const r = await assetsApi.usages(asset.path);
      setUsageCounts((prev) => ({ ...prev, [asset.path]: r.usages.length }));
    } catch {
      // Ignore — drawer will surface the error if the request fails.
    }
  };

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (images === null || filteredAndSorted === null || renderGroups === null)
    return <div className="text-neutral-500">Loading…</div>;

  const totalShown = filteredAndSorted.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Assets{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== images.length ? ` / ${images.length}` : ""})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => showImageEditor({ kind: "import" })}
          >
            + Import
          </Button>
          <ViewToggle mode={view} onChange={setView} options={CARDS_LIST_OPTIONS} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="search basename, folder, uid…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${textInput} mt-0 max-w-xs flex-1`}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          folder
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {folderOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id || "(root)"} ({opt.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          format
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {formatOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id} ({opt.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          group
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className={`${textInput} mt-0 w-auto`}
          >
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((k) => (
              <option key={k} value={k}>
                {GROUP_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={`${textInput} mt-0 w-auto`}
          >
            {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex items-center gap-2 text-xs text-neutral-400"
          title="Only assets that no .tres / JSON references — caveat: only known after you've opened the drawer for them"
        >
          <input
            type="checkbox"
            checked={orphansOnly}
            onChange={(e) => setOrphansOnly(e.target.checked)}
            className="size-3 accent-emerald-600"
          />
          orphans only
        </label>
      </div>

      {images.length === 0 ? (
        <EmptyState
          illustration={<WorkshopEmpty className="size-32" />}
          title="No images yet"
          body={
            <>
              Drop PNGs / SVGs anywhere under the Godot project; the gallery
              picks them up automatically once Godot generates the{" "}
              <span className="font-mono">.import</span> sidecar. Phase 3
              (importer + crop) lands here next.
            </>
          }
        />
      ) : totalShown === 0 ? (
        <p className="text-neutral-500">No images match the current filter.</p>
      ) : (
        <div className="space-y-6">
          {renderGroups.map((g) => {
            const renderItem = (asset: ImageAsset) => {
              const onContextMenu = makeAssetContextMenuHandler({
                asset,
                openEditor: showImageEditor,
              });
              const onOpenEditor = () =>
                showImageEditor({ kind: "edit", assetPath: asset.path });
              return view === "cards" ? (
                <AssetCard
                  key={asset.path}
                  asset={asset}
                  usageCount={usageCounts[asset.path] ?? null}
                  onShowUsages={() => handleShowUsages(asset)}
                  onOpenEditor={onOpenEditor}
                  onContextMenu={onContextMenu}
                />
              ) : (
                <AssetRow
                  key={asset.path}
                  asset={asset}
                  usageCount={usageCounts[asset.path] ?? null}
                  onShowUsages={() => handleShowUsages(asset)}
                  onOpenEditor={onOpenEditor}
                  onContextMenu={onContextMenu}
                />
              );
            };

            const grid =
              view === "cards" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {g.items.map(renderItem)}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {g.items.map(renderItem)}
                </div>
              );

            return (
              <section key={g.id || "ungrouped"}>
                {g.label && (
                  <h2 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {g.label}
                    <span className="text-[10px] text-neutral-600">
                      ({g.items.length})
                    </span>
                  </h2>
                )}
                {grid}
              </section>
            );
          })}
        </div>
      )}

      {drawerAsset && (
        <UsagesDrawer asset={drawerAsset} onClose={() => setDrawerAsset(null)} />
      )}

    </div>
  );
}
