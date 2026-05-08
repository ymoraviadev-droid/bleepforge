import {
  type ContextMenuItem,
  showContextMenu,
} from "../../components/ContextMenu";
import { showConfirm } from "../../components/Modal";
import { pushToast } from "../../components/Toast";
import { assetsApi, assetUrl, type ImageAsset } from "../../lib/api";
import type { EditorMode } from "./ImageEditor";

// One-stop wiring for the asset right-click menu. Three surface modes:
//
//   default          → Preview only          (list/card pages, dialog
//                                              graph, concept view —
//                                              "looking at images, not
//                                              managing them")
//   canEdit=true     → Edit · Preview        (edit pages, picker
//                                              text-field thumb —
//                                              "I'm tweaking the
//                                              entity's image")
//   canEdit=true +
//   canManage=true   → Edit · Duplicate ·    (gallery, picker browse
//                       Delete · Preview      modal — "image management
//                                              surface, full toolkit")
//
// The split keeps destructive ops (Duplicate creates a new file;
// Delete removes the file + sidecar from disk) out of edit pages
// where the user's mental model is "I'm editing one entity"; those
// actions only appear on dedicated image-management surfaces.
// Preview is universal and cheap — opens the image in a new browser
// tab via assetUrl(path). Useful even on outer pages.

export interface AssetMenuOptions {
  asset: ImageAsset | { path: string; basename: string };
  /** Open the editor in the given mode. The host is responsible for
   *  rendering the editor; this hook just builds the menu items. */
  openEditor: (mode: EditorMode) => void;
  /** When true, the menu includes Edit. Default false → Preview only. */
  canEdit?: boolean;
  /** When true (and canEdit=true), the menu also includes Duplicate
   *  and Delete. Default false. */
  canManage?: boolean;
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
    const items = buildAssetMenuItems(opts);
    if (items.length === 0) return; // nothing to show — fall through
    showContextMenu({ x: e.clientX, y: e.clientY, items });
  };
}

export function buildAssetMenuItems(opts: AssetMenuOptions): ContextMenuItem[] {
  const path = opts.asset.path;
  const basename = opts.asset.basename;
  const items: ContextMenuItem[] = [];
  if (opts.canEdit) {
    items.push({
      label: "Edit…",
      onClick: () => opts.openEditor({ kind: "edit", assetPath: path }),
    });
  }
  if (opts.canEdit && opts.canManage) {
    items.push({
      label: "Duplicate…",
      onClick: () => opts.openEditor({ kind: "duplicate", assetPath: path }),
    });
    items.push({
      label: "Delete…",
      danger: true,
      onClick: opts.onDelete ?? (() => defaultDelete(path, basename)),
    });
  }
  // Preview is always available. Opens the file in a new browser tab
  // via the same /api/asset?path=... endpoint that powers AssetThumb.
  items.push({
    label: "Preview",
    onClick: () => {
      window.open(assetUrl(path), "_blank", "noopener,noreferrer");
    },
  });
  return items;
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
