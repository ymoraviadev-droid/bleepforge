// Shape of an image asset descriptor surfaced to clients. Built by the
// discovery pass + sidecar parse + native dim probe. Returned by
// /api/assets/images and pushed via the asset SSE stream.

export type ImageFormat = "png" | "jpg" | "webp" | "gif" | "svg" | "bmp";

export interface ImageAsset {
  /** Absolute filesystem path to the image. */
  path: string;
  /** Basename including extension ("eddie-portrait2.png"). */
  basename: string;
  /** Parent directory path (absolute) — used for grouping. */
  parentDir: string;
  /** Path-relative-to-Godot-root for display ("characters/npcs/hap_500/art"). */
  parentRel: string;
  /** "png" / "svg" / etc. */
  format: ImageFormat;
  /** UID from the .png.import / .svg.import sidecar. Null when no sidecar. */
  uid: string | null;
  /** Pixel width — null when undetectable (unsupported format). */
  width: number | null;
  /** Pixel height — null when undetectable. */
  height: number | null;
  /** Bytes on disk. */
  sizeBytes: number;
  /** Modified-at timestamp (ms since epoch). */
  mtimeMs: number;
}

/** Live event published when an image file changes on disk. */
export interface AssetEvent {
  kind: "added" | "changed" | "removed";
  path: string;
}
