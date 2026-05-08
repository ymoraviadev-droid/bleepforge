import { useEffect, useState } from "react";

import { showImageEditor } from "../features/asset/imageEditorHost";
import { makeAssetContextMenuHandler } from "../features/asset/useAssetMenu";
import { assetUrl } from "../lib/api";

interface Props {
  path: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** When true (default) the thumb wires click → open image editor and
   *  right-click → Edit / Duplicate / Delete menu. Opt out with
   *  `editable={false}` for the rare cases where the parent already
   *  owns click semantics on the same surface — currently just the
   *  AssetPicker's browse modal, where each file row is a `<button>`
   *  whose click means "pick this image for the field". */
  editable?: boolean;
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
// AssetPicker preview). When `path` is a real asset path, the thumb
// becomes the universal entry point to the image editor:
//
//   - click → open editor in `edit` mode for this image
//   - right-click → context menu with Edit / Duplicate / Delete
//
// stopPropagation on both so the thumb's behavior doesn't fight a
// surrounding clickable parent (NPC card linking to /npcs/:id, etc.) —
// click on the card's body still navigates; click on the portrait
// edits the portrait. Cursor switches to pointer + a hover ring on
// the thumb itself signals the dual-action.
export function AssetThumb({
  path,
  size = "md",
  className = "",
  editable = true,
}: Props) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [path]);

  if (!path) return null;
  const sizeClass = SIZES[size];
  const interactive = editable && !errored && !!path;
  const onClick = interactive
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        showImageEditor({ kind: "edit", assetPath: path });
      }
    : undefined;
  const onContextMenu = interactive
    ? makeAssetContextMenuHandler({
        asset: { path, basename: path.split("/").pop() ?? path },
        openEditor: showImageEditor,
      })
    : undefined;
  const interactiveClass = interactive
    ? "cursor-pointer transition-colors hover:border-emerald-600 focus-visible:border-emerald-500 focus-visible:outline-none"
    : "";

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
      title={interactive ? `${path} · click to edit, right-click for more` : path}
      onError={() => setErrored(true)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                showImageEditor({ kind: "edit", assetPath: path });
              }
            }
          : undefined
      }
      className={`${sizeClass} ${className} ${interactiveClass} shrink-0 rounded border border-neutral-800 bg-neutral-950 object-contain`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
