import type { ReactNode } from "react";
import type { CodexPropertyDef } from "@bleepforge/shared";
import { AssetThumb } from "../../components/AssetThumb";

interface Props {
  def: CodexPropertyDef;
  value: unknown;
  /** Compact mode for cards / rows — truncates long strings, smaller image
   *  thumb. Default false (full inline rendering). */
  compact?: boolean;
}

// Shared "render this property value as ReactNode" — used by CodexCard,
// CodexRow, and the entry edit page's read-only-when-empty fallback. Keeps
// formatting choices (boolean glyphs, "(empty)" placeholder, image size)
// in one place so the rest of the UI doesn't have to worry about which
// type prints how.

export function PropertyValueRenderer({ def, value, compact = false }: Props): ReactNode {
  const empty = (
    <span className="font-mono text-[10px] italic text-neutral-600">(empty)</span>
  );

  const isEmpty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value === "") ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) return empty;

  switch (def.Type) {
    case "text":
    case "multiline":
      if (typeof value !== "string") return empty;
      return (
        <span
          className={
            compact
              ? "block truncate font-mono text-xs text-neutral-200"
              : "block whitespace-pre-wrap font-mono text-sm text-neutral-100"
          }
        >
          {value}
        </span>
      );
    case "number":
      return (
        <span className="font-mono text-xs text-neutral-100">
          {typeof value === "number" ? String(value) : empty}
        </span>
      );
    case "boolean":
      return (
        <span
          className={
            value === true
              ? "font-mono text-xs text-emerald-400"
              : "font-mono text-xs text-neutral-500"
          }
        >
          {value === true ? "✓ yes" : "✗ no"}
        </span>
      );
    case "image":
      return typeof value === "string" ? (
        <AssetThumb path={value} size={compact ? "xs" : "sm"} canEdit={false} />
      ) : (
        empty
      );
    case "ref":
      return (
        <span className="font-mono text-xs text-cyan-300">
          {typeof value === "string" ? value : empty}
        </span>
      );
    case "tags":
      if (!Array.isArray(value)) return empty;
      return (
        <span className="flex flex-wrap gap-1">
          {value.map((tag, i) =>
            typeof tag === "string" ? (
              <span
                key={`${tag}-${i}`}
                className="border border-emerald-700/60 bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200"
              >
                {tag}
              </span>
            ) : null,
          )}
        </span>
      );
    default:
      return empty;
  }
}
