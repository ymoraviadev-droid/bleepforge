import { useEffect, useState } from "react";

import { showContextMenu } from "../../components/ContextMenu";
import { showPrompt } from "../../components/Modal";
import { pushToast } from "../../components/Toast";
import type { FoldersResponse } from "../../lib/api";
import { assetsApi } from "../../lib/api";
import { fieldLabel } from "../../styles/classes";

// Navigates the Godot project's directory tree, dirs only. The "current
// directory" *is* the selected target — clicking a folder enters it,
// rather than a two-step "navigate then select" flow. This matches the
// mental model of a save dialog: where you are is where you'll save.
//
// Two ways to create a new folder without leaving the editor:
//   1. "+ New folder" button in the header → creates inside the current
//      directory (where you'll save).
//   2. Right-click on any folder entry → context menu with "Create
//      subfolder here…" so you can drop a folder inside a sibling
//      without first navigating into it.
// Both go through the same showPrompt → assetsApi.createFolder path,
// then refresh the listing and (for the header button) navigate into
// the new folder so the picker is already pointing at the user's
// freshly-made destination.

interface Props {
  /** Initial directory (absolute path under godotProjectRoot). Optional —
   *  defaults to the project root if omitted or invalid. */
  initialDir?: string;
  onChange: (absoluteDir: string) => void;
}

export function FolderPicker({ initialDir, onChange }: Props) {
  const [data, setData] = useState<FoldersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    assetsApi
      .listFolders(initialDir)
      .then((r) => {
        setData(r);
        onChange(r.cwd);
      })
      .catch((e) => setError(String(e)));
    // initialDir intentionally only fires the first fetch — subsequent
    // navigation is driven by the user, not by prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = async (dir: string | null) => {
    if (!dir) return;
    try {
      const r = await assetsApi.listFolders(dir);
      setData(r);
      onChange(r.cwd);
    } catch (e) {
      setError(String(e));
    }
  };

  // Refresh the current view without navigating. Used after creating a
  // subfolder inside a sibling so the new entry shows up.
  const refresh = async () => {
    if (!data) return;
    try {
      const r = await assetsApi.listFolders(data.cwd);
      setData(r);
    } catch {
      // non-fatal — next user action will retry
    }
  };

  // Shared create-folder flow. `parentDir` decides where the new folder
  // lands; `enterAfterCreate` decides whether to navigate into it (true
  // when the user hit + in the header — they want to save into the new
  // folder; false when they right-clicked a sibling — they're just
  // organizing).
  const createFolderIn = async (
    parentDir: string,
    enterAfterCreate: boolean,
  ) => {
    const name = await showPrompt({
      title: "New folder",
      message: `Create a new folder in ${displayPathOf(parentDir, data?.root) ?? parentDir}.`,
      placeholder: "my-folder",
      confirmLabel: "Create",
      validate: (v) => {
        const trimmed = v.trim();
        if (!trimmed) return "Name required";
        if (/[\\/]/.test(trimmed)) return "No slashes";
        if (trimmed === "." || trimmed === ".." || trimmed.startsWith(".")) {
          return "No leading dots";
        }
        if (!/^[a-zA-Z0-9._ -]+$/.test(trimmed)) {
          return "Letters / digits / _ / - / space only";
        }
        return null;
      },
    });
    if (!name) return;
    try {
      const result = await assetsApi.createFolder({
        parentDir,
        name: name.trim(),
      });
      if (enterAfterCreate) {
        await navigate(result.path);
      } else {
        await refresh();
      }
      pushToast({
        id: `folder-created:${result.path}`,
        variant: "success",
        title: "Folder created",
        body: result.path,
      });
    } catch (err) {
      pushToast({
        id: "folder-create-error",
        variant: "error",
        title: "Couldn't create folder",
        body: (err as Error).message,
      });
    }
  };

  const onFolderContextMenu = (
    e: React.MouseEvent,
    folderPath: string,
    folderName: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Open",
          onClick: () => navigate(folderPath),
        },
        {
          label: `Create subfolder in ${folderName}…`,
          onClick: () => createFolderIn(folderPath, false),
        },
      ],
    });
  };

  if (error) {
    return (
      <p className="font-mono text-[11px] text-red-400">Error: {error}</p>
    );
  }
  if (!data) {
    return <p className="font-mono text-[11px] text-neutral-500">Loading…</p>;
  }

  const isAtRoot = data.cwd === data.root;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className={fieldLabel}>Destination folder</p>
          <button
            type="button"
            onClick={() => createFolderIn(data.cwd, true)}
            title="Create a new folder inside the current directory"
            className="border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
          >
            + New folder
          </button>
        </div>
        <p
          className="mt-1 truncate border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-[11px] text-emerald-400"
          title={data.cwd}
        >
          {data.cwdRel ? `res://${data.cwdRel}` : "res:// (project root)"}
        </p>
      </div>
      <div className="flex max-h-44 flex-col overflow-y-auto border-2 border-neutral-800 bg-neutral-950">
        {!isAtRoot && (
          <button
            type="button"
            onClick={() => navigate(data.parent)}
            className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 text-left font-mono text-[11px] text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-emerald-300"
          >
            <span aria-hidden className="text-neutral-600">↑</span>
            <span>..</span>
          </button>
        )}
        {data.dirs.length === 0 ? (
          <p className="px-2 py-1 font-mono text-[11px] text-neutral-600">
            (no subfolders)
          </p>
        ) : (
          data.dirs.map((d) => (
            <button
              key={d.path}
              type="button"
              onClick={() => navigate(d.path)}
              onContextMenu={(e) => onFolderContextMenu(e, d.path, d.name)}
              className="flex items-center gap-2 border-b border-neutral-900 px-2 py-1 text-left font-mono text-[11px] text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-emerald-300"
            >
              <FolderIcon />
              <span className="truncate">{d.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function displayPathOf(absPath: string, root: string | undefined): string | null {
  if (!root) return null;
  if (absPath === root) return "res:// (project root)";
  if (absPath.startsWith(root)) {
    const rel = absPath.slice(root.length).replace(/^\/+/, "");
    return `res://${rel}`;
  }
  return null;
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0 text-emerald-600/80"
    >
      <rect x="0" y="2" width="5" height="1" />
      <rect x="0" y="3" width="12" height="1" />
      <rect x="0" y="3" width="1" height="7" />
      <rect x="11" y="3" width="1" height="7" />
      <rect x="0" y="9" width="12" height="1" />
    </svg>
  );
}
