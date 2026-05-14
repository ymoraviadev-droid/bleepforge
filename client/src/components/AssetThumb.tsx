import { useEffect, useState } from "react";

import { showImageEditor } from "../features/asset/imageEditorHost";
import { makeAssetContextMenuHandler } from "../features/asset/useAssetMenu";
import { assetUrl } from "../lib/api";
import { lastPathSegment } from "../lib/clientPath";

interface Props {
  path: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** When false, the thumb has no click + no context menu of its own.
   *  Used by the AssetPicker's browse modal, where each file row is a
   *  `<button>` whose click means "pick this image for the field" —
   *  the surrounding `<li>` separately wires its own onContextMenu.
   *  Default true. */
  editable?: boolean;
  /** When true, the thumb is clickable (click → open image editor in
   *  edit mode) AND the right-click menu includes "Edit". Default
   *  false — list/card pages stay calm, with Preview-only menus, since
   *  editing the file isn't the user's primary action there. Edit
   *  pages and the AssetPicker's text-field thumb opt in. */
  canEdit?: boolean;
  /** When true (and canEdit=true), the right-click menu also includes
   *  Duplicate and Delete. Default false. Reserved for dedicated
   *  image-management surfaces (gallery cards/rows, AssetPicker browse
   *  modal) where destructive file-system actions are expected. */
  canManage?: boolean;
}

const SIZES = {
  xs: "size-8",
  sm: "size-10",
  md: "size-14",
  lg: "size-24",
};

// Image-by-path component used everywhere a Bleepforge image shows up
// (NPC portraits, item icons, dialog line portraits, faction icons +
// banners, balloon speakers, concept hero, gallery cards' thumb slot,
// AssetPicker preview).
//
// Universal click rule: when editable=true, click ALWAYS opens a
// preview (the image in a new browser tab via assetUrl). Editing is
// ALWAYS via right-click → Edit. One rule everywhere; click never
// opens the heavy editor modal accidentally.
//
// Right-click menu items are gated on canEdit / canManage:
//
//   default                        menu = Preview
//   canEdit                        menu = Edit · Preview
//   canEdit + canManage            menu = Edit · Duplicate · Delete · Preview
//
// `editable={false}` opts out entirely — used by the AssetPicker
// browse modal's file rows where the surrounding <button> + <li> own
// click + context-menu themselves.
//
// stopPropagation on both handlers so the thumb's behavior doesn't
// fight a surrounding clickable parent — click on the card body still
// navigates to the entity (e.g. NPC card → /npcs/:id), click on the
// portrait previews the portrait.
export function AssetThumb({
  path,
  size = "md",
  className = "",
  editable = true,
  canEdit = false,
  canManage = false,
}: Props) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [path]);

  if (!path) return null;
  const sizeClass = SIZES[size];
  const enabled = editable && !errored && !!path;
  const onClick = enabled
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(assetUrl(path), "_blank", "noopener,noreferrer");
      }
    : undefined;
  const onContextMenu = enabled
    ? makeAssetContextMenuHandler({
        asset: { path, basename: lastPathSegment(path) },
        openEditor: showImageEditor,
        canEdit,
        canManage,
      })
    : undefined;
  // When clickable, signal the affordance with cursor + hover ring +
  // focus ring. canEdit doesn't change this — preview is the click
  // action regardless of canEdit; canEdit only changes what's in the
  // right-click menu.
  const interactiveClass = enabled
    ? "cursor-pointer transition-colors hover:border-emerald-600 focus-visible:border-emerald-500 focus-visible:outline-none"
    : "";
  const tooltip = enabled
    ? canEdit
      ? `${path} · click to preview, right-click to edit`
      : `${path} · click to preview`
    : path;

  if (errored) {
    return (
      <div
        className={`${sizeClass} ${className} flex shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-[10px] text-neutral-500`}
        title={`Not found: ${path}`}
      >
        ?
      </div>
    );
  }

  return (
    <img
      src={assetUrl(path)}
      alt=""
      title={tooltip}
      onError={() => setErrored(true)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role={enabled ? "button" : undefined}
      tabIndex={enabled ? 0 : undefined}
      onKeyDown={
        enabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                window.open(assetUrl(path), "_blank", "noopener,noreferrer");
              }
            }
          : undefined
      }
      className={`${sizeClass} ${className} ${interactiveClass} shrink-0 rounded border border-neutral-800 bg-neutral-950 object-contain`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
