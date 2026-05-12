import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "../../components/Button";
import { EmptyState, WorkshopEmpty } from "../../components/EmptyState";
import {
  CARDS_LIST_OPTIONS,
  useViewMode,
  ViewToggle,
} from "../../components/ViewToggle";
import type { ShaderAsset, ShaderType } from "../../lib/api";
import { shadersApi } from "../../lib/api";
import { useShaderRefresh } from "../../lib/shaders/useShaderRefresh";
import { textInput } from "../../styles/classes";
import { NewShaderModal } from "./NewShaderModal";
import { ShaderCard } from "./ShaderCard";
import { ShaderRow } from "./ShaderRow";
import { buildShaderEditUrl } from "./format";
import { makeShaderContextMenuHandler } from "./shaderMenu";

// Shader gallery — Phase 1 of the shader work. Browses every .gdshader
// found under the Godot project, with a "used by N" reverse-lookup pill
// for each (clicking the pill navigates to the shader's view page where
// the full usage list is rendered inline).
//
// Phase 2 will add authoring affordances (save, new, duplicate, delete)
// + SSE-driven live refresh; Phase 3 adds a WebGL2 preview canvas + the
// GDShader → GLSL ES subset translator.

type SortBy = "name" | "folder" | "size" | "mtime";
type GroupBy = "folder" | "shader_type" | "none";

const SORT_LABEL: Record<SortBy, string> = {
  name: "name",
  folder: "folder",
  size: "size",
  mtime: "modified",
};

const GROUP_LABEL: Record<GroupBy, string> = {
  folder: "folder",
  shader_type: "type",
  none: "none",
};

interface Group {
  id: string;
  label: string;
  items: ShaderAsset[];
}

export function ShaderList() {
  const [shaders, setShaders] = useState<ShaderAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<ShaderType | "">("");
  const [sortBy, setSortBy] = useState<SortBy>("folder");
  const [groupBy, setGroupBy] = useState<GroupBy>("folder");
  const [view, setView] = useViewMode("shader");
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [creatingNew, setCreatingNew] = useState(false);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    shadersApi
      .list()
      .then((r) => setShaders(r.shaders))
      .catch((e) => setError(String(e)));
    shadersApi
      .usageCounts()
      .then(setUsageCounts)
      .catch(() => {
        // Non-fatal — pills just stay at "…" until next refresh.
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Phase 2: SSE auto-refresh. Any shader add/change/remove pushes a
  // re-fetch of the list + usage counts. Coalescing isn't worth the
  // complexity at this corpus size — even a burst of events is cheap.
  useShaderRefresh(refresh);

  const folderOptions = useMemo(() => {
    if (!shaders) return [];
    const counts = new Map<string, number>();
    for (const sh of shaders) {
      counts.set(sh.parentRel, (counts.get(sh.parentRel) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [shaders]);

  const typeOptions = useMemo(() => {
    if (!shaders) return [];
    const counts = new Map<string, number>();
    for (const sh of shaders) {
      const k = sh.shaderType ?? "unknown";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [shaders]);

  const filteredAndSorted = useMemo(() => {
    if (!shaders) return null;
    const q = search.toLowerCase().trim();
    const filtered = shaders.filter((sh) => {
      if (folderFilter && sh.parentRel !== folderFilter) return false;
      if (typeFilter && sh.shaderType !== typeFilter) return false;
      if (!q) return true;
      return (
        sh.basename.toLowerCase().includes(q) ||
        sh.parentRel.toLowerCase().includes(q) ||
        (sh.uid?.toLowerCase().includes(q) ?? false)
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
  }, [shaders, search, folderFilter, typeFilter, sortBy]);

  const renderGroups = useMemo<Group[] | null>(() => {
    if (!filteredAndSorted) return null;
    if (groupBy === "none") {
      return [{ id: "all", label: "", items: filteredAndSorted }];
    }
    const buckets = new Map<string, ShaderAsset[]>();
    for (const sh of filteredAndSorted) {
      const k =
        groupBy === "folder"
          ? sh.parentRel
          : (sh.shaderType ?? "unknown");
      const list = buckets.get(k) ?? [];
      list.push(sh);
      buckets.set(k, list);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, items]) => ({ id: k, label: k || "(root)", items }));
  }, [filteredAndSorted, groupBy]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (shaders === null || filteredAndSorted === null || renderGroups === null)
    return <div className="text-neutral-500">Loading…</div>;

  const totalShown = filteredAndSorted.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Shaders{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== shaders.length ? ` / ${shaders.length}` : ""})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setCreatingNew(true)}
          >
            + New shader
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
          type
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ShaderType | "")}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {typeOptions.map((opt) => (
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
      </div>

      {shaders.length === 0 ? (
        <EmptyState
          illustration={<WorkshopEmpty className="size-32" />}
          title="No shaders yet"
          body={
            <>
              Use <span className="font-mono">+ New shader</span> above to
              create one from a template, or drop a{" "}
              <span className="font-mono">.gdshader</span> anywhere under the
              Godot project — the gallery picks them up automatically. Phase 3
              (subset translator + WebGL preview) lands next.
            </>
          }
          action={{
            label: "+ New shader",
            onClick: () => setCreatingNew(true),
          }}
        />
      ) : totalShown === 0 ? (
        <p className="text-neutral-500">No shaders match the current filter.</p>
      ) : (
        <div className="space-y-6">
          {renderGroups.map((g) => {
            const onShowUsages = (asset: ShaderAsset) => {
              // "used by N" pill navigates to the edit page where the
              // full usage list renders inline (no drawer — the corpus
              // is small and the destination's where you'd go to act
              // on the info anyway).
              navigate(buildShaderEditUrl(asset.path));
            };
            const renderItem = (sh: ShaderAsset) => {
              const onContextMenu = makeShaderContextMenuHandler({
                asset: sh,
                navigate: (to) => navigate(to),
              });
              return view === "cards" ? (
                <ShaderCard
                  key={sh.path}
                  asset={sh}
                  usageCount={usageCounts[sh.path] ?? null}
                  onShowUsages={() => onShowUsages(sh)}
                  onContextMenu={onContextMenu}
                />
              ) : (
                <ShaderRow
                  key={sh.path}
                  asset={sh}
                  usageCount={usageCounts[sh.path] ?? null}
                  onShowUsages={() => onShowUsages(sh)}
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

      {creatingNew && (
        <NewShaderModal
          onClose={() => setCreatingNew(false)}
          onCreated={(path) => {
            setCreatingNew(false);
            navigate(buildShaderEditUrl(path));
          }}
        />
      )}
    </div>
  );
}
