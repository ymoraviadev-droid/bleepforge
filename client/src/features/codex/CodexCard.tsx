import { Link } from "react-router";
import type { CodexCategoryMeta, CodexEntry } from "@bleepforge/shared";
import { AssetThumb } from "../../components/AssetThumb";
import { IconPlaceholder } from "../../components/PixelPlaceholder";
import { categoryColorClasses } from "./categoryColor";
import { PropertyValueRenderer } from "./PropertyValueRenderer";

interface CodexCardProps {
  entry: CodexEntry;
  meta: CodexCategoryMeta;
}

// Card representation of a Codex entry. Image (or pixel placeholder),
// display name, line-clamped description, category-colored top stripe,
// then up to four property values for at-a-glance scanning. Tags get
// their own row at the bottom (chip strip) since they're a different
// shape from the rest.
export function CodexCard({ entry, meta }: CodexCardProps) {
  const colors = categoryColorClasses(meta.Color);

  // Pick up to 4 properties to surface on the card. Skip tags (rendered
  // separately at the bottom) and image (already rendered as the card
  // thumbnail at top). The schema author's order is preserved — if they
  // put "damage" first, "damage" shows first.
  const propsToShow = meta.Properties.filter(
    (p) => p.Type !== "tags" && p.Type !== "image",
  ).slice(0, 4);

  // Tags get their own bottom strip if any tags-typed property exists
  // and has at least one value.
  const tagProperties = meta.Properties.filter((p) => p.Type === "tags");

  return (
    <Link
      to={`/codex/${encodeURIComponent(meta.Category)}/${encodeURIComponent(entry.Id)}`}
      className={`group block border-2 bg-neutral-950 transition-colors ${colors.border} ${colors.borderHover}`}
    >
      {/* Per-category accent stripe atop the card. Reads as the
          category's identity-color without overpowering the content. */}
      <div className={`h-1 ${colors.stripe}`} aria-hidden />
      <div className="flex items-start gap-3 p-3">
        {entry.Image ? (
          <AssetThumb path={entry.Image} size="md" canEdit={false} />
        ) : (
          <IconPlaceholder
            className="size-14 shrink-0 text-neutral-700"
            title="No image"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-neutral-100">
            {entry.DisplayName || entry.Id}
          </div>
          <div className="truncate font-mono text-[10px] text-neutral-500">
            {entry.Id}
          </div>
          {entry.Description && (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-neutral-400">
              {entry.Description}
            </p>
          )}
        </div>
      </div>
      {propsToShow.length > 0 && (
        <div className="space-y-1 border-t border-neutral-800/70 px-3 py-2">
          {propsToShow.map((def) => (
            <div key={def.Key} className="flex items-baseline gap-2">
              <span className="w-20 shrink-0 truncate font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                {def.Label || def.Key}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <PropertyValueRenderer
                  def={def}
                  value={entry.Properties[def.Key]}
                  compact
                />
              </span>
            </div>
          ))}
        </div>
      )}
      {tagProperties.map((def) => {
        const value = entry.Properties[def.Key];
        if (!Array.isArray(value) || value.length === 0) return null;
        return (
          <div
            key={def.Key}
            className="border-t border-neutral-800/70 px-3 py-2"
          >
            <PropertyValueRenderer def={def} value={value} compact />
          </div>
        );
      })}
    </Link>
  );
}
