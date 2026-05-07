import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ButtonLink } from "../Button";
import type { DialogSequence } from "@bleepforge/shared";
import { dialogsApi } from "../api";
import { useSyncRefresh } from "../sync/useSyncRefresh";
import { FolderTabs } from "./FolderTabs";

export function DialogList() {
  const [folders, setFolders] = useState<string[] | null>(null);
  const [seqs, setSeqs] = useState<DialogSequence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  const folderParam = searchParams.get("folder");
  const folder = folderParam ?? folders?.[0] ?? null;

  useEffect(() => {
    dialogsApi.listFolders().then(setFolders).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!folder) {
      setSeqs([]);
      return;
    }
    setSeqs(null);
    dialogsApi.listInFolder(folder).then(setSeqs).catch((e) => setError(String(e)));
  }, [folder]);

  // Live-refresh on any external dialog change in the current folder.
  useSyncRefresh({
    domain: "dialog",
    onChange: (e) => {
      if (!folder) return;
      // event.key shape "<folder>/<id>"
      const [eventFolder] = e.key.split("/");
      if (eventFolder !== folder) return;
      dialogsApi.listInFolder(folder).then(setSeqs).catch(() => {});
    },
  });

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (folders === null) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dialog sequences</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            to={folder ? `/dialogs?folder=${encodeURIComponent(folder)}` : "/dialogs"}
            className="text-neutral-400 hover:text-neutral-200"
          >
            Graph view
          </Link>
          <ButtonLink to={folder ? `/dialogs/new?folder=${encodeURIComponent(folder)}` : "/dialogs/new"}>New</ButtonLink>
        </div>
      </div>

      <div className="mb-4">
        <FolderTabs folders={folders} selected={folder} basePath="/dialogs/list" />
      </div>

      {folders.length === 0 ? (
        <p className="text-neutral-500">No folders yet. Create your first dialog.</p>
      ) : seqs === null ? (
        <div className="text-neutral-500">Loading…</div>
      ) : seqs.length === 0 ? (
        <p className="text-neutral-500">
          No sequences in <span className="font-mono text-neutral-300">{folder}</span>.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {seqs.map((s) => (
            <li key={s.Id} className="hover:bg-neutral-900">
              <Link
                to={`/dialogs/${encodeURIComponent(folder!)}/${encodeURIComponent(s.Id)}`}
                className="block px-4 py-3"
              >
                <div className="font-mono text-sm text-neutral-100">{s.Id}</div>
                <div className="text-xs text-neutral-500">
                  {s.Lines.length} {s.Lines.length === 1 ? "line" : "lines"}
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
