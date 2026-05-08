// Display-formatters shared by the asset card / row / drawer. Pulled out
// so the three views render the same "320×200" / "12.4 KB" strings
// without copy-paste drift.

export function fmtDims(width: number | null, height: number | null): string {
  if (width === null || height === null) return "—";
  return `${width}×${height}`;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Checkered transparency background — pure CSS, theme-neutral, cheap.
// Two ~6px squares; sized intentionally small so it reads as a
// transparency hint rather than a feature in itself. Used as the bg of
// every image preview so transparent pixels are visible.
export const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%)," +
    "linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%)," +
    "linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%)," +
    "linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
};
