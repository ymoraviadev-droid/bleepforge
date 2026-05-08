import {
  type ContextMenuItem,
  showContextMenu,
} from "../../components/ContextMenu";
import { showConfirm } from "../../components/Modal";
import { pushToast } from "../../components/Toast";
import { assetsApi, type ImageAsset } from "../../lib/api";
import type { EditorMode } from "./ImageEditor";

// One-stop wiring for the asset right-click menu. Used by AssetCard,
// AssetRow, and the AssetPicker browse modal so all three surfaces share
// the same Edit/Duplicate/Delete behavior.
//
// `openEditor` is passed in by the host so it can decide where the
// editor renders (the Assets page hosts it inline; the AssetPicker
// hosts it as a stacked modal). Delete is fully self-contained — fires
// the API, shows a toast, and the gallery's SSE subscription refreshes.

export interface AssetMenuOptions {
  asset: ImageAsset | { path: string; basename: string };
  /** Open the editor in the given mode. The host is responsible for
   *  rendering the editor; this hook just builds the menu items. */
  openEditor: (mode: EditorMode) => void;
  /** Optional: override the default delete confirm with a usage warning.
   *  When set, the hook calls this instead of showConfirm so the host
   *  can fetch usages first and surface them in the message. */
  onDelete?: () => Promise<void> | void;
}

/**
 * Returns a function suitable for `onContextMenu`. Pre-binds the menu
 * items for one asset.
 */
export function makeAssetContextMenuHandler(
  opts: AssetMenuOptions,
): (e: React.MouseEvent) => void {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildAssetMenuItems(opts),
    });
  };
}

export function buildAssetMenuItems(opts: AssetMenuOptions): ContextMenuItem[] {
  const path = opts.asset.path;
  const basename = opts.asset.basename;
  return [
    {
      label: "Edit…",
      onClick: () => opts.openEditor({ kind: "edit", assetPath: path }),
    },
    {
      label: "Duplicate…",
      onClick: () =>
        opts.openEditor({ kind: "duplicate", assetPath: path }),
    },
    {
      label: "Delete…",
      danger: true,
      onClick: opts.onDelete ?? (() => defaultDelete(path, basename)),
    },
  ];
}

async function defaultDelete(path: string, basename: string): Promise<void> {
  // First check usages so we can warn the user. Cheap (one HTTP round
  // trip; usage scan is on the order of <50ms for this corpus).
  let usageCount = 0;
  try {
    const res = await assetsApi.usages(path);
    usageCount = res.usages.length;
  } catch {
    // If the lookup fails, fall back to a generic confirm — better than
    // nothing.
  }
  const message =
    usageCount > 0
      ? `${basename} is referenced by ${usageCount} ${usageCount === 1 ? "place" : "places"} (.tres or JSON). Delete anyway? Existing references will become broken.`
      : `Delete ${basename}? This removes the file and its .import sidecar from the Godot project.`;
  const ok = await showConfirm({
    title: "Delete image",
    message,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await assetsApi.deleteFile(path);
    pushToast({
      id: `asset-delete:${path}`,
      variant: "info",
      title: "Image deleted",
      body: `Removed ${res.removed.length} files.`,
    });
  } catch (err) {
    pushToast({
      id: `asset-delete-error:${path}`,
      variant: "error",
      title: "Delete failed",
      body: (err as Error).message,
    });
  }
}
