import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ButtonLink } from "../../components/Button";
import type { DialogSequence, DialogSourceType } from "@bleepforge/shared";
import { dialogsApi } from "../../lib/api";
import { useSyncRefresh } from "../../lib/sync/useSyncRefresh";
import { GRAPH_LIST_OPTIONS, ViewToggle } from "../../components/ViewToggle";
import { FolderTabs } from "./FolderTabs";
import { SourceFilter, useDialogSourceFilter } from "./SourceFilter";

import { PixelSkeleton } from "../../components/PixelSkeleton";
export function DialogList() {
  const [folders, setFolders] = useState<string[] | null>(null);
  // Folder → sequences mapping across the whole project. Used by visibleFolders
  // so the FolderTabs hide folders that have nothing matching the active
  // SourceType filter — same logic the Graph view uses.
  const [folderTypeIndex, setFolderTypeIndex] = useState<
    Map<string, DialogSourceType[]>
  >(new Map());
  const [seqs, setSeqs] = useState<DialogSequence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const folderParam = searchParams.get("folder");
  const folder = folderParam ?? folders?.[0] ?? null;

  // Persisted via localStorage so toggling Graph ↔ List preserves the filter.
  const [sourceFilter, setSourceFilter] = useDialogSourceFilter();

  useEffect(() => {
    dialogsApi.listFolders().then(setFolders).catch((e) => setError(String(e)));
    refreshFolderTypeIndex();
  }, []);

  function refreshFolderTypeIndex() {
    dialogsApi
      .listAll()
      .then((groups) => {
        const m = new Map<string, DialogSourceType[]>();
        for (const g of groups) {
          m.set(
            g.folder,
            g.sequences.map((s) => s.SourceType),
          );
        }
        setFolderTypeIndex(m);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!folder) {
      setSeqs([]);
      return;
    }
    setSeqs(null);
    dialogsApi.listInFolder(folder).then(setSeqs).catch((e) => setError(String(e)));
  }, [folder]);

  // Live-refresh on any external dialog change. Always rebuild the type index
  // (a SourceType change in another folder can flip visibleFolders); only
  // refetch sequences when the event hits the current folder.
  useSyncRefresh({
    domain: "dialog",
    onChange: (e) => {
      refreshFolderTypeIndex();
      if (!folder) return;
      const [eventFolder] = e.key.split("/");
      if (eventFolder !== folder) return;
      dialogsApi.listInFolder(folder).then(setSeqs).catch(() => {});
    },
  });

  // Folders that contain at least one sequence matching the active source
  // filter. When filter is "all", every folder is visible. Folders with an
  // unknown type (index hasn't loaded yet) are kept — better to over-show
  // during the brief boot window than to hide content the user just opened to.
  const visibleFolders = useMemo(() => {
    if (!folders) return [] as string[];
    if (sourceFilter === "all") return folders;
    return folders.filter((f) => {
      const types = folderTypeIndex.get(f);
      if (!types || types.length === 0) return true;
      return types.some((t) => t === sourceFilter);
    });
  }, [folders, folderTypeIndex, sourceFilter]);

  // If the current folder is hidden by the active filter, hop to the first
  // visible one so the user lands on real data instead of an empty list.
  // Mirrors the same behavior in Graph.tsx.
  useEffect(() => {
    if (!folder) return;
    if (visibleFolders.length === 0) return;
    if (visibleFolders.includes(folder)) return;
    navigate(
      `/dialogs/list?folder=${encodeURIComponent(visibleFolders[0]!)}`,
      { replace: true },
    );
  }, [folder, visibleFolders, navigate]);

  // Filter visible sequences in the current folder by SourceType.
  const filteredSeqs = useMemo(() => {
    if (!seqs) return null;
    if (sourceFilter === "all") return seqs;
    return seqs.filter((s) => s.SourceType === sourceFilter);
  }, [seqs, sourceFilter]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (folders === null) return <PixelSkeleton />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dialog sequences</h1>
        <div className="flex items-center gap-2 text-sm">
          <ViewToggle
            mode="list"
            onChange={(m) => {
              if (m === "list") return;
              navigate(
                folder
                  ? `/dialogs?folder=${encodeURIComponent(folder)}`
                  : "/dialogs",
              );
            }}
            options={GRAPH_LIST_OPTIONS}
          />
          <ButtonLink
            to={
              folder
                ? `/dialogs/new?folder=${encodeURIComponent(folder)}`
                : "/dialogs/new"
            }
          >
            New
          </ButtonLink>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <FolderTabs
          folders={visibleFolders}
          selected={folder}
          basePath="/dialogs/list"
          typesByFolder={folderTypeIndex}
        />
        <SourceFilter value={sourceFilter} onChange={setSourceFilter} />
      </div>

      {folders.length === 0 ? (
        <p className="text-neutral-500">No folders yet. Create your first dialog.</p>
      ) : visibleFolders.length === 0 ? (
        <p className="text-neutral-500">
          No folders contain {sourceFilter === "Npc" ? "NPC" : sourceFilter} sequences.
        </p>
      ) : seqs === null || filteredSeqs === null ? (
        <PixelSkeleton />
      ) : filteredSeqs.length === 0 ? (
        <p className="text-neutral-500">
          No {sourceFilter === "all" ? "" : `${sourceFilter === "Npc" ? "NPC" : sourceFilter} `}
          sequences in <span className="font-mono text-neutral-300">{folder}</span>.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {filteredSeqs.map((s) => (
            <li key={s.Id} className="hover:bg-neutral-900">
              <Link
                to={`/dialogs/${encodeURIComponent(folder!)}/${encodeURIComponent(s.Id)}`}
                className="block px-4 py-3"
              >
                <div className="font-mono text-sm text-neutral-100">{s.Id}</div>
                <div className="text-xs text-neutral-500">
                  {s.Lines.length} {s.Lines.length === 1 ? "line" : "lines"}
                  {" · "}
                  <span
                    className={
                      s.SourceType === "Terminal"
                        ? "text-source-terminal-400"
                        : "text-source-npc-400"
                    }
                  >
                    {s.SourceType}
                  </span>
                  {s.SetsFlag ? ` · sets ${s.SetsFlag}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
