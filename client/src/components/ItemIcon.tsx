import { useEffect, useState } from "react";
import { assetUrl, itemIconApi, type ItemIconResponse } from "../lib/api";
import { useSyncRefresh } from "../lib/sync/useSyncRefresh";

interface Props {
  slug: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const TARGET_PX = { xs: 32, sm: 40, md: 56, lg: 96 } as const;

// Reads the item's Icon descriptor from the live .tres (via /api/item-icon)
// and renders it. Atlas-textured icons are shown as a CSS-clipped sub-rect
// of the source atlas; direct Texture2D refs render as a normal img.
export function ItemIcon({ slug, size = "md", className = "" }: Props) {
  const [icon, setIcon] = useState<ItemIconResponse | undefined>(undefined);

  useEffect(() => {
    setIcon(undefined);
    itemIconApi.get(slug).then(setIcon).catch(() => setIcon(null));
  }, [slug]);

  // Re-fetch the icon descriptor when this item's .tres changes — the icon
  // is read directly from the .tres (atlas region / ext_resource path), so
  // a Godot-side edit can change which sprite to render.
  useSyncRefresh({
    domain: "item",
    key: slug,
    onChange: () => {
      itemIconApi.get(slug).then(setIcon).catch(() => setIcon(null));
    },
  });

  const target = TARGET_PX[size];
  const boxStyle = { width: target, height: target };

  if (icon === undefined) {
    return (
      <div
        className={`${className} shrink-0 rounded border border-neutral-800 bg-neutral-950`}
        style={boxStyle}
      />
    );
  }

  if (icon === null) {
    return (
      <div
        className={`${className} flex shrink-0 items-center justify-center rounded border border-dashed border-neutral-800 text-[10px] text-neutral-600`}
        style={boxStyle}
        title={`No icon for ${slug}`}
      >
        ·
      </div>
    );
  }

  if (icon.kind === "image") {
    return (
      <img
        src={assetUrl(icon.imagePath)}
        alt=""
        title={icon.imagePath}
        className={`${className} shrink-0 rounded border border-neutral-800 bg-neutral-950 object-contain`}
        style={{ ...boxStyle, imageRendering: "pixelated" }}
      />
    );
  }

  return <AtlasView atlas={icon} target={target} className={className} />;
}

function AtlasView({
  atlas,
  target,
  className,
}: {
  atlas: { atlasPath: string; region: { x: number; y: number; w: number; h: number } };
  target: number;
  className: string;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [errored, setErrored] = useState(false);
  const url = assetUrl(atlas.atlasPath);
  const r = atlas.region;
  // Integer scale so pixel art stays crisp.
  const scale = Math.max(1, Math.floor(Math.min(target / r.w, target / r.h)));
  const cropW = r.w * scale;
  const cropH = r.h * scale;

  if (errored) {
    return (
      <div
        className={`${className} flex shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-[10px] text-neutral-500`}
        style={{ width: target, height: target }}
        title={`Atlas not loadable: ${atlas.atlasPath}`}
      >
        ?
      </div>
    );
  }

  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded border border-neutral-800 bg-neutral-950`}
      style={{ width: target, height: target }}
      title={`${atlas.atlasPath} @ ${r.x},${r.y} ${r.w}×${r.h}`}
    >
      {natural ? (
        <div
          style={{
            width: cropW,
            height: cropH,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <img
            src={url}
            alt=""
            style={{
              position: "absolute",
              left: -r.x * scale,
              top: -r.y * scale,
              width: natural.w * scale,
              height: natural.h * scale,
              imageRendering: "pixelated",
              maxWidth: "none",
            }}
          />
        </div>
      ) : (
        <img
          src={url}
          alt=""
          style={{ display: "none" }}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
