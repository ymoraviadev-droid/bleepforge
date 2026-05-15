import { useState } from "react";

import { Button } from "../../components/Button";
import {
  godotProjectApi,
  projectsApi,
  type CreateProjectResult,
} from "../../lib/api";
import { isElectron, pickGodotFolder } from "../../lib/electron";
import { fieldLabel, textInput } from "../../styles/classes";

// Two-field modal for project creation. Mode picker (notebook in phase
// 5; sync added in phase 6) + display name. Server derives the slug
// and creates dirs.
//
// Same dialog chrome as NewShaderModal — fixed centered panel +
// dimmed backdrop, header + form body. Pattern is clear across the
// app's "imperative dialog with custom fields" surfaces.

interface Props {
  onClose: () => void;
  onCreated: (result: CreateProjectResult) => void;
}

type ModeOption = "notebook" | "sync";

interface ModeChoice {
  id: ModeOption;
  label: string;
  blurb: string;
  available: boolean;
}

const MODES: ModeChoice[] = [
  {
    id: "notebook",
    label: "Notebook",
    blurb:
      "Standalone. Bleepforge owns the data + assets + shaders inside the project. No Godot connection — perfect for design docs or for projects that won't ship through Godot.",
    available: true,
  },
  {
    id: "sync",
    label: "Sync to Godot",
    blurb:
      "Two-way live sync with a Godot project's .tres files. Bleepforge mirrors the entity JSON from .tres on every boot and writes edits back on save; the watcher catches Godot-side changes live.",
    available: true,
  },
];

type GodotValidation =
  | { kind: "idle" }
  | { kind: "validating"; path: string }
  | { kind: "valid"; path: string }
  | { kind: "invalid"; path: string; message: string };

export function NewProjectModal({ onClose, onCreated }: Props) {
  const [mode, setMode] = useState<ModeOption>("notebook");
  const [displayName, setDisplayName] = useState("");
  const [godotPathInput, setGodotPathInput] = useState("");
  const [godotState, setGodotState] = useState<GodotValidation>({
    kind: "idle",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = displayName.trim();
  const syncReady = mode === "sync" ? godotState.kind === "valid" : true;
  const canSubmit = !creating && trimmedName.length > 0 && syncReady;

  async function validateGodot(path: string): Promise<void> {
    setGodotState({ kind: "validating", path });
    try {
      const r = await godotProjectApi.validate(path);
      if (r.ok && r.isProject) {
        setGodotState({ kind: "valid", path });
      } else {
        setGodotState({
          kind: "invalid",
          path,
          message: r.message ?? "Not a valid Godot project",
        });
      }
    } catch (err) {
      setGodotState({
        kind: "invalid",
        path,
        message: err instanceof Error ? err.message : "Validation failed",
      });
    }
  }

  async function onPickFolder(): Promise<void> {
    const picked = await pickGodotFolder();
    if (!picked) return;
    setGodotPathInput(picked);
    await validateGodot(picked);
  }

  async function handleCreate(): Promise<void> {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    try {
      const result = await projectsApi.create({
        displayName: trimmedName,
        mode,
        godotProjectRoot:
          mode === "sync" && godotState.kind === "valid"
            ? godotState.path
            : undefined,
      });
      onCreated(result);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={() => !creating && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="New project"
        className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b-2 border-neutral-800 px-4 py-3">
          <h2 className="font-display text-sm uppercase tracking-wider text-neutral-100">
            New project
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
          <fieldset>
            <legend className={fieldLabel}>Mode</legend>
            <div className="mt-2 space-y-2">
              {MODES.map((m) => {
                const active = mode === m.id;
                const disabled = !m.available;
                return (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-3 border-2 p-3 transition-colors ${
                      disabled
                        ? "cursor-not-allowed border-neutral-900 bg-neutral-950/40 opacity-50"
                        : active
                        ? "border-emerald-600/70 bg-emerald-950/30"
                        : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="project-mode"
                      value={m.id}
                      checked={active}
                      disabled={disabled}
                      onChange={() => setMode(m.id)}
                      className="mt-1 accent-emerald-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-100">
                        {m.label}
                        {disabled && (
                          <span className="ml-2 font-mono text-[10px] text-amber-400">
                            (phase 6)
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-neutral-400">
                        {m.blurb}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {mode === "sync" && (
            <div>
              <label className={fieldLabel}>Godot project folder</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={godotPathInput}
                  onChange={(e) => {
                    setGodotPathInput(e.target.value);
                    setGodotState({ kind: "idle" });
                  }}
                  onBlur={() => {
                    const p = godotPathInput.trim();
                    if (p && godotState.kind === "idle") void validateGodot(p);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && godotPathInput.trim()) {
                      e.preventDefault();
                      void validateGodot(godotPathInput.trim());
                    }
                  }}
                  placeholder="/path/to/your/godot-project"
                  className={`${textInput} flex-1`}
                />
                {isElectron() && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onPickFolder}
                  >
                    Browse…
                  </Button>
                )}
              </div>
              {godotState.kind === "validating" && (
                <p className="mt-1 font-mono text-[10px] text-neutral-500">
                  Checking{" "}
                  <span className="text-neutral-300">{godotState.path}</span>…
                </p>
              )}
              {godotState.kind === "valid" && (
                <p className="mt-1 font-mono text-[10px] text-emerald-300">
                  ✓ project.godot found
                </p>
              )}
              {godotState.kind === "invalid" && (
                <p className="mt-1 font-mono text-[10px] text-red-300">
                  ✗ {godotState.message}
                </p>
              )}
              {godotState.kind === "idle" && godotPathInput.trim() && (
                <p className="mt-1 font-mono text-[10px] text-amber-400">
                  Press Enter or blur to validate.
                </p>
              )}
              <p className="mt-1 font-mono text-[10px] text-neutral-600">
                The folder containing{" "}
                <code className="text-neutral-400">project.godot</code>. After
                creation the boot reconcile will populate Bleepforge's JSON
                cache from the project's .tres files.
              </p>
            </div>
          )}

          <div>
            <label className={fieldLabel} htmlFor="new-project-name">
              Display name
            </label>
            <input
              id="new-project-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My new game"
              autoFocus
              className={`${textInput} mt-1`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
            <p className="mt-1 font-mono text-[10px] text-neutral-600">
              A URL-safe slug is derived automatically (lowercase + hyphens).
              The display name can be renamed later; the slug is immutable.
            </p>
          </div>

          {error && (
            <p className="border-2 border-red-700 bg-red-950/40 p-2 text-xs text-red-200">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t-2 border-neutral-800 px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={!canSubmit}
          >
            {creating ? "Creating…" : "Create project"}
          </Button>
        </footer>
      </div>
    </>
  );
}
