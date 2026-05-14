import { useState } from "react";
import { AppIcon } from "./AppIcon";
import { CreditLine } from "./Footer";
import { pushToast } from "./Toast";
import { godotProjectApi, preferencesApi } from "../lib/api";
import { isElectron, pickGodotFolder, restartApp } from "../lib/electron";

// First-run setup screen. Renders instead of the app shell when no
// Godot project root is configured (preferences.godotProjectRoot is
// empty AND no GODOT_PROJECT_ROOT env var was set at boot — i.e.
// server is in limp mode). User picks a folder, we validate it, save
// to preferences, and restart the app so the server captures the new
// root at next boot.
//
// Two pick paths: Electron uses the native folder dialog via the
// `pickGodotFolder` IPC; browser-dev mode falls back to a text input
// (the user pastes an absolute path). Both go through the same
// validation endpoint and produce the same downstream state.

type ValidationState =
  | { kind: "idle" }
  | { kind: "validating"; path: string }
  | { kind: "valid"; path: string }
  | { kind: "invalid"; path: string; message: string };

export function WelcomeScreen() {
  const [state, setState] = useState<ValidationState>({ kind: "idle" });
  const [manualPath, setManualPath] = useState("");
  const [saving, setSaving] = useState(false);

  async function validatePath(path: string) {
    setState({ kind: "validating", path });
    try {
      const res = await godotProjectApi.validate(path);
      if (res.ok && res.isProject) {
        setState({ kind: "valid", path });
      } else {
        setState({
          kind: "invalid",
          path,
          message: res.message ?? "Not a valid Godot project",
        });
      }
    } catch (err) {
      setState({
        kind: "invalid",
        path,
        message: err instanceof Error ? err.message : "Validation failed",
      });
    }
  }

  async function onPickFolder() {
    const path = await pickGodotFolder();
    if (path) await validatePath(path);
  }

  // Save the picked path to preferences via a direct API call (bypassing
  // the GlobalTheme persist queue so we can await the server response
  // before restarting — the queued path is fire-and-forget). Then call
  // the restart IPC; the server will pick up the new root at next boot.
  async function onApply() {
    if (state.kind !== "valid") return;
    setSaving(true);
    try {
      const current = await preferencesApi.get();
      await preferencesApi.save({ ...current, godotProjectRoot: state.path });
      const restarted = await restartApp();
      if (!restarted) {
        // Browser-dev mode: server runs separately, can't relaunch from
        // here. The save did land — user just needs to restart their
        // `pnpm dev` process.
        pushToast({
          id: "welcome:browser-restart",
          title: "Saved — restart the server manually to apply",
          variant: "info",
        });
        setSaving(false);
      }
    } catch (err) {
      pushToast({
        id: "welcome:save-failed",
        title: "Save failed",
        body: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950 px-6">
      <div className="flex w-[min(90vw,640px)] flex-col items-center">
        <AppIcon className="mb-4 size-20" />
        <div className="font-display text-3xl tracking-wider text-emerald-400">
          BLEEPFORGE
        </div>
        <div className="mt-2 font-mono text-xs text-neutral-500">
          Welcome — let's get you set up
        </div>

        <p className="mt-10 max-w-md text-center text-sm leading-relaxed text-neutral-300">
          To author content for your Godot project, point me at the folder
          containing{" "}
          <span className="font-mono text-emerald-400">project.godot</span>.
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col gap-3">
          {isElectron() ? (
            <button
              type="button"
              onClick={onPickFolder}
              disabled={saving || state.kind === "validating"}
              className="border-2 border-emerald-600 bg-emerald-950/40 px-5 py-3 font-display text-xs tracking-wider text-emerald-300 transition-colors hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              PICK GAME FOLDER…
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[10px] tracking-wider text-neutral-500">
                PASTE YOUR GODOT PROJECT'S ABSOLUTE PATH
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualPath.trim()) {
                      void validatePath(manualPath.trim());
                    }
                  }}
                  placeholder="/home/.../astro-man"
                  className="flex-1 border-2 border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-200 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (manualPath.trim()) void validatePath(manualPath.trim());
                  }}
                  disabled={!manualPath.trim() || saving}
                  className="border-2 border-emerald-600 bg-emerald-950/40 px-4 py-2 font-display text-[10px] tracking-wider text-emerald-300 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  CHECK
                </button>
              </div>
            </div>
          )}

          {state.kind === "validating" && (
            <div className="mt-2 font-mono text-[11px] text-neutral-400">
              Checking{" "}
              <span className="text-neutral-200">{state.path}</span>…
            </div>
          )}
          {state.kind === "valid" && (
            <div className="mt-2 border-l-2 border-emerald-500 bg-emerald-950/30 px-3 py-2">
              <div className="font-mono text-[11px] text-emerald-300">
                ✓ project.godot found
              </div>
              <div className="mt-0.5 break-all font-mono text-[10px] text-neutral-400">
                {state.path}
              </div>
            </div>
          )}
          {state.kind === "invalid" && (
            <div className="mt-2 border-l-2 border-red-500 bg-red-950/30 px-3 py-2">
              <div className="font-mono text-[11px] text-red-300">
                ✗ {state.message}
              </div>
              <div className="mt-0.5 break-all font-mono text-[10px] text-neutral-400">
                {state.path}
              </div>
            </div>
          )}

          {state.kind === "valid" && (
            <button
              type="button"
              onClick={onApply}
              disabled={saving}
              autoFocus
              className="splash-continue-glow mt-4 border-2 border-emerald-600 bg-emerald-950/40 px-5 py-3 font-display text-xs tracking-wider text-emerald-300 transition-colors hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "RESTARTING…" : "APPLY & RESTART"}
            </button>
          )}
        </div>
      </div>

      <div className="absolute right-0 bottom-6 left-0">
        <CreditLine />
      </div>
    </div>
  );
}
