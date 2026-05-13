import { useEffect, useMemo, useState } from "react";

import {
  SHADER_PATTERN_IDS,
  type ShaderPattern,
} from "@bleepforge/shared";
import { Button } from "../../components/Button";
import { pushToast } from "../../components/Toast";
import type { ShaderType } from "../../lib/api";
import { shadersApi } from "../../lib/api";
import { fieldLabel, textInput } from "../../styles/classes";
import { FolderPicker } from "../asset/FolderPicker";
import { shaderTypeLabel } from "./format";
import { PatternPicker } from "./PatternPicker";

// Self-contained modal for shader creation. Lighter shape than the
// imperative Modal.tsx singleton (which only supports confirm + single-
// input prompt) because shader creation needs three fields. Lives next
// to the list page; the list owns the open/closed state.
//
// Folder picker is the same FolderPicker the asset import uses — same
// "where you are is where you save" mental model, with right-click +
// "+ New folder" affordances baked in. Filename gets `.gdshader`
// appended server-side if the user leaves it off; shader_type defaults
// to canvas_item (the only type the Phase 3 translator will support).

interface Props {
  onClose: () => void;
  onCreated: (path: string) => void;
}

const TYPE_OPTIONS: ShaderType[] = [
  "canvas_item",
  "spatial",
  "particles",
  "sky",
  "fog",
];

export function NewShaderModal({ onClose, onCreated }: Props) {
  const [targetDir, setTargetDir] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [shaderType, setShaderType] = useState<ShaderType>("canvas_item");
  // Random initial pattern — same shape the server uses for its default,
  // but picking client-side too means the picker shows something other
  // than "scanlines" most of the time so the user sees the variety up
  // front. `useMemo` so the pick is stable across re-renders.
  const initialPattern = useMemo<ShaderPattern>(() => {
    const idx = Math.floor(Math.random() * SHADER_PATTERN_IDS.length);
    return SHADER_PATTERN_IDS[idx]!;
  }, []);
  const [pattern, setPattern] = useState<ShaderPattern>(initialPattern);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, creating]);

  const canSubmit = !!targetDir && filename.trim().length > 0 && !creating;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    try {
      const r = await shadersApi.create({
        targetDir,
        filename: filename.trim(),
        shaderType,
      });
      // Apply the user-picked pattern (server seeded a random one; the
      // user may have changed it before submitting — push that choice
      // through immediately so the card paints with the right pattern).
      try {
        await shadersApi.setPattern(r.path, pattern);
      } catch {
        // Non-fatal — the random default from the server remains. Don't
        // block the success toast.
      }
      pushToast({
        id: `shader-created:${r.path}`,
        variant: "success",
        title: "Shader created",
        body: r.asset?.basename ?? filename,
      });
      onCreated(r.path);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={() => !creating && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="New shader"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b-2 border-neutral-800 px-4 py-3">
          <h2 className="font-display text-sm uppercase tracking-wider text-neutral-100">
            New shader
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            aria-label="Close"
            className="border border-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div>
            <label className={fieldLabel}>Folder</label>
            <div className="mt-1 border-2 border-neutral-800 bg-neutral-900">
              <FolderPicker onChange={setTargetDir} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={fieldLabel} htmlFor="shader-new-filename">
                Filename
              </label>
              <input
                id="shader-new-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="my_shader"
                autoFocus
                className={textInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
              <p className="mt-1 font-mono text-[10px] text-neutral-600">
                .gdshader extension is appended if omitted.
              </p>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="shader-new-type">
                Shader type
              </label>
              <select
                id="shader-new-type"
                value={shaderType}
                onChange={(e) => setShaderType(e.target.value as ShaderType)}
                className={textInput}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {shaderTypeLabel(t)}
                  </option>
                ))}
              </select>
              <p className="mt-1 font-mono text-[10px] text-neutral-600">
                Sets the template's first line. Change later in the editor.
              </p>
            </div>
          </div>

          <div>
            <label className={fieldLabel}>Card pattern</label>
            <p className="mb-2 font-mono text-[10px] text-neutral-600">
              Bleepforge-only visual identity for the card. A random one
              is pre-selected; change anytime in Edit.
            </p>
            <PatternPicker value={pattern} onChange={setPattern} />
          </div>

          {error && (
            <div className="border-2 border-red-700 bg-red-950/40 px-3 py-2 font-mono text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t-2 border-neutral-800 px-4 py-3">
          <Button onClick={onClose} variant="secondary" disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="primary"
            disabled={!canSubmit}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </footer>
      </div>
    </>
  );
}
