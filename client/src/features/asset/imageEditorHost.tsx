import { useEffect, useState, type ReactElement } from "react";

import { ImageEditor, type EditorMode } from "./ImageEditor";

// Singleton image-editor host. Mirrors the shape of Modal.tsx /
// Toast.tsx / ContextMenu.tsx — module-level state + pub/sub + a
// host component mounted once at the App root. Lets ANY component
// anywhere in the app open the editor with one call:
//
//   showImageEditor({ kind: "edit", assetPath })
//   showImageEditor({ kind: "import" }, { onSaved: (p) => onPick(p) })
//
// Without this, every component that wants to open the editor would
// have to thread its own state + render the modal itself — that's how
// it started and it didn't scale once we wanted click-to-edit on every
// image across the app.
//
// The optional `onSaved` callback runs when the editor reports a save
// completed. Used by the AssetPicker to auto-pick a freshly imported
// or duplicated file. After firing, the host emits a window-level
// `Bleepforge:image-saved` CustomEvent so any other interested page
// (the gallery's snappy refetch) can update without coupling to the
// caller of showImageEditor.

interface ActiveSession {
  mode: EditorMode;
  onSaved?: (savedPath: string) => void;
}

interface ImageSavedDetail {
  path: string;
}

declare global {
  interface WindowEventMap {
    "Bleepforge:image-saved": CustomEvent<ImageSavedDetail>;
  }
}

let active: ActiveSession | null = null;
const subs = new Set<() => void>();

function notify(): void {
  for (const fn of subs) fn();
}

export function showImageEditor(
  mode: EditorMode,
  options?: { onSaved?: (savedPath: string) => void },
): void {
  active = { mode, onSaved: options?.onSaved };
  notify();
}

export function hideImageEditor(): void {
  if (!active) return;
  active = null;
  notify();
}

export function ImageEditorHost(): ReactElement | null {
  const [session, setSession] = useState<ActiveSession | null>(active);
  useEffect(() => {
    const sub = () => setSession(active);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, []);

  if (!session) return null;
  return (
    <ImageEditor
      mode={session.mode}
      onClose={() => {
        active = null;
        notify();
      }}
      onSaved={(savedPath) => {
        // Run the per-call callback first (e.g. picker's onPick), then
        // broadcast for everyone else.
        session.onSaved?.(savedPath);
        window.dispatchEvent(
          new CustomEvent("Bleepforge:image-saved", {
            detail: { path: savedPath },
          }),
        );
      }}
    />
  );
}
