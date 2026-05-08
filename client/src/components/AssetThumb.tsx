import { useEffect, useState } from "react";
import { assetUrl } from "../lib/api";

interface Props {
  path: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  xs: "size-8",
  sm: "size-10",
  md: "size-14",
  lg: "size-24",
};

export function AssetThumb({ path, size = "md", className = "" }: Props) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [path]);

  if (!path) return null;
  const sizeClass = SIZES[size];

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
      title={path}
      onError={() => setErrored(true)}
      className={`${sizeClass} ${className} shrink-0 rounded border border-neutral-800 bg-neutral-950 object-contain`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
