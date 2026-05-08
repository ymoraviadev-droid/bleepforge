import { useEffect, useState } from "react";

import { ImageEditor, type EditorMode } from "../features/asset/ImageEditor";
import { makeAssetContextMenuHandler } from "../features/asset/useAssetMenu";
import { AssetThumb } from "./AssetThumb";
import { Button } from "./Button";
import { button, textInput } from "../styles/classes";

interface PickerProps {
  path: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

export function AssetPicker({ path, onChange, placeholder }: PickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <AssetThumb path={path} size="md" />
      <input
        value={path}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${textInput} mt-0 flex-1 font-mono text-xs`}
      />
      <button
        onClick={() => setOpen(true)}
        className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
        type="button"
      >
        Browse…
      </button>
      {path && (
        <button
          onClick={() => onChange("")}
          className="text-xs text-red-400 hover:text-red-300"
          type="button"
          title="Clear"
        >
          ×
        </button>
      )}
      {open && (
        <BrowseModal
          startDir={dirOf(path)}
          onPick={(picked) => {
            onChange(picked);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function dirOf(p: string): string | undefined {
  if (!p) return undefined;
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : undefined;
}

interface Entry {
  name: string;
  path: string;
  kind: "dir" | "file";
}
interface Listing {
  cwd: string;
  parent: string | null;
  root: string;
  entries: Entry[];
}

interface ModalProps {
  startDir?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

// Browse + edit modal. Beyond the original "click to pick" behavior, we
// now support: + Import (full editor in import mode), and right-click
// → Edit / Duplicate / Delete on any image. The editor is hosted as a
// stacked modal — when a save lands, we refresh the listing and (for
// Import / Duplicate) auto-pick the freshly-saved file.
function BrowseModal({ startDir, onPick, onClose }: ModalProps) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorMode | null>(null);

  const load = (dir?: string) => {
    setListing(null);
    setError(null);
    const url =
      "/api/asset/browse" + (dir ? `?dir=${encodeURIComponent(dir)}` : "");
    fetch(url)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        setListing(data);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    load(startDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-190 flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Browsing
            </div>
            <div className="truncate font-mono text-xs text-neutral-200">
              {listing?.cwd ?? "…"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => setEditor({ kind: "import" })}
            >
              + Import
            </Button>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-100"
              type="button"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-auto p-2">
          {error && (
            <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {!listing && !error && (
            <div className="p-4 text-sm text-neutral-500">Loading…</div>
          )}
          {listing && (
            <ul className="space-y-1">
              {listing.parent && (
                <li>
                  <button
                    onClick={() => load(listing.parent!)}
                    className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-800"
                    type="button"
                  >
                    <span className="text-neutral-500">↰</span>
                    <span className="text-neutral-300">.. (up)</span>
                  </button>
                </li>
              )}
              {listing.entries.length === 0 && (
                <li className="px-2 py-1.5 text-sm text-neutral-600">
                  No subfolders or images here.
                </li>
              )}
              {listing.entries.map((e) =>
                e.kind === "dir" ? (
                  <li key={e.path}>
                    <button
                      onClick={() => load(e.path)}
                      className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-800"
                      type="button"
                    >
                      <span>📁</span>
                      <span className="text-neutral-200">{e.name}</span>
                    </button>
                  </li>
                ) : (
                  <li
                    key={e.path}
                    onContextMenu={makeAssetContextMenuHandler({
                      asset: { path: e.path, basename: e.name },
                      openEditor: setEditor,
                    })}
                  >
                    <button
                      onClick={() => onPick(e.path)}
                      className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-neutral-800"
                      type="button"
                    >
                      <AssetThumb path={e.path} size="sm" />
                      <span className="font-mono text-xs text-neutral-200">
                        {e.name}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-500">
          Click image to pick · Right-click for Edit / Duplicate / Delete · + Import for new files
        </div>

        {editor && (
          <ImageEditor
            mode={editor}
            onClose={() => setEditor(null)}
            onSaved={(savedPath) => {
              // Refresh the listing of the directory the file landed in,
              // and auto-pick it if we're in Import or Duplicate mode
              // (Edit returns the user to the picker without touching the
              // current selection — they were already pointed at it).
              const newDir = savedPath.slice(0, savedPath.lastIndexOf("/"));
              load(newDir);
              if (editor.kind !== "edit") onPick(savedPath);
            }}
          />
        )}
      </div>
    </div>
  );
}
