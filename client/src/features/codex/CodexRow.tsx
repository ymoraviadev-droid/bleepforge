import { Link } from "react-router";
import type { CodexCategoryMeta, CodexEntry } from "@bleepforge/shared";
import { AssetThumb } from "../../components/AssetThumb";
import { categoryColorClasses } from "./categoryColor";

interface CodexRowProps {
  entry: CodexEntry;
  meta: CodexCategoryMeta;
}

// Compact single-row representation. Mirrors BalloonRow's density —
// category badge, image (or blank), display name, id, description preview.
export function CodexRow({ entry, meta }: CodexRowProps) {
  const colors = categoryColorClasses(meta.Color);

  return (
    <Link
      to={`/codex/${encodeURIComponent(meta.Category)}/${encodeURIComponent(entry.Id)}`}
      className={`group flex items-center gap-3 border-2 border-neutral-800 bg-neutral-950 px-3 py-2 transition-colors hover:border-neutral-700 hover:bg-neutral-900`}
    >
      <span
        className={`w-20 shrink-0 truncate border bg-neutral-900 px-1 py-0.5 text-center font-mono text-[10px] uppercase tracking-wider ${colors.border} ${colors.text}`}
      >
        {meta.DisplayName || meta.Category}
      </span>
      {entry.Image ? (
        <AssetThumb path={entry.Image} size="xs" canEdit={false} />
      ) : (
        <span className="size-8 shrink-0 border border-dashed border-neutral-800" />
      )}
      <span className="w-40 shrink-0 truncate text-sm font-semibold text-neutral-100">
        {entry.DisplayName || entry.Id}
      </span>
      <span className="hidden w-32 shrink-0 truncate font-mono text-xs text-neutral-500 sm:block">
        {entry.Id}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">
        {entry.Description || (
          <span className="italic text-neutral-600">(no description)</span>
        )}
      </span>
    </Link>
  );
}
