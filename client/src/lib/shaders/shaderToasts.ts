// Maps shader SSE events into toasts. Mounted at App root via
// useShaderToasts(). Parallel to lib/sync/syncToasts.ts but on a separate
// channel because shader events have a different shape (kind + path,
// not domain + key + action).
//
// Suppresses echoes of this client's own saves via the localSaves tracker
// — without that, every Save button click in the edit page would also
// trigger a toast, on top of the in-page status pill. Echoes from OTHER
// windows (or from Godot) have no matching local record, so they toast
// normally and the user gets a heads-up.

import { useEffect } from "react";
import { pushToast } from "../../components/Toast";
import { isRecentLocalShaderSave } from "./localSaves";
import type { ShaderEvent } from "./stream";

function basename(p: string): string {
  const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return slash >= 0 ? p.slice(slash + 1) : p;
}

export function useShaderToasts(): void {
  useEffect(() => {
    const onShader = (e: CustomEvent<ShaderEvent>) => {
      const { kind, path } = e.detail;
      if (isRecentLocalShaderSave(path)) return;
      const removed = kind === "removed";
      pushToast({
        // Dedupe by path+kind so a chain of rapid external edits replaces
        // the existing toast for the same shader instead of stacking.
        id: `shader:${path}:${kind}`,
        title: `Shader ${removed ? "deleted" : kind === "added" ? "added" : "saved"}`,
        body: basename(path),
        to: removed
          ? "/shaders"
          : `/shaders/edit?path=${encodeURIComponent(path)}`,
        variant: removed ? "warn" : "success",
      });
    };
    window.addEventListener("Bleepforge:shader", onShader);
    return () => window.removeEventListener("Bleepforge:shader", onShader);
  }, []);
}
