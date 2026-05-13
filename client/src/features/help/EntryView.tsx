import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { compareEntries } from "@bleepforge/shared";
import { formatLongDate } from "../../lib/date";
import { NotFoundPage } from "../../components/NotFoundPage";
import { paletteColorClasses } from "../../lib/paletteColor";
import { useHelpLayout } from "./HelpLayout";
import { RenderHelpBody } from "./render";

import { PixelSkeleton } from "../../components/PixelSkeleton";
// Single help entry view. The persistent sidebar comes from HelpLayout
// (so navigating between entries doesn't unmount it); this component
// renders only the body + prev/next pager into the outlet. Entry data
// is derived from the layout's allGroups context — no separate fetch
// per click, which is what used to cause the "refresh blink".

export function EntryView() {
  const { category, id } = useParams();
  const { allGroups } = useHelpLayout();

  const group = useMemo(() => {
    if (!allGroups || !category) return null;
    return allGroups.find((g) => g.category === category) ?? null;
  }, [allGroups, category]);

  const entry = useMemo(() => {
    if (!group || !id) return null;
    return group.entries.find((e) => e.Id === id) ?? null;
  }, [group, id]);

  const sortedSiblings = useMemo(() => {
    if (!group) return null;
    return [...group.entries].sort(compareEntries);
  }, [group]);

  const navIndex = useMemo(() => {
    if (!sortedSiblings || !entry) return -1;
    return sortedSiblings.findIndex((s) => s.Id === entry.Id);
  }, [sortedSiblings, entry]);

  if (allGroups === null || !category)
    return <PixelSkeleton />;
  if (!group || !entry || !sortedSiblings) return <NotFoundPage />;

  const meta = group.meta;
  const colors = paletteColorClasses(meta.Color);
  const categoryDisplay = meta.DisplayName || category;
  const prev = navIndex > 0 ? sortedSiblings[navIndex - 1] : null;
  const next =
    navIndex >= 0 && navIndex < sortedSiblings.length - 1
      ? sortedSiblings[navIndex + 1]
      : null;

  return (
    <article className="min-w-0 space-y-6">
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link to="/help" className="hover:text-neutral-300">
          Help
        </Link>
        <span className="text-neutral-700">/</span>
        <Link
          to={`/help/${encodeURIComponent(category)}`}
          className={`hover:underline ${colors.text}`}
        >
          {categoryDisplay}
        </Link>
        <span className="text-neutral-700">/</span>
        <span className="text-neutral-300">{entry.Title || entry.Id}</span>
      </nav>

      <header className="space-y-2 border-b-2 border-neutral-800 pb-4">
        <h1 className="text-2xl font-semibold text-neutral-100">
          {entry.Title || entry.Id}
        </h1>
        {entry.Summary && (
          <p className="text-sm leading-relaxed text-neutral-400">
            {entry.Summary}
          </p>
        )}
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-neutral-600">
          {entry.Section && (
            <span className="border border-neutral-800 px-1.5 py-0.5">
              {entry.Section}
            </span>
          )}
          {entry.UpdatedAt && (
            <span>
              updated {formatLongDate(entry.UpdatedAt)}
            </span>
          )}
        </div>
      </header>

      {entry.Body ? (
        <RenderHelpBody body={entry.Body} />
      ) : (
        <p className="text-sm italic text-neutral-600">
          This entry has no body yet.
        </p>
      )}

      <footer className="grid grid-cols-2 gap-3 border-t-2 border-neutral-800 pt-4 text-sm">
        <div>
          {prev && (
            <Link
              to={`/help/${encodeURIComponent(category)}/${encodeURIComponent(prev.Id)}`}
              className="block border border-neutral-800 px-3 py-2 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                ← previous
              </div>
              <div className="text-neutral-200">
                {prev.Title || prev.Id}
              </div>
            </Link>
          )}
        </div>
        <div>
          {next && (
            <Link
              to={`/help/${encodeURIComponent(category)}/${encodeURIComponent(next.Id)}`}
              className="block border border-neutral-800 px-3 py-2 text-right transition-colors hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                next →
              </div>
              <div className="text-neutral-200">
                {next.Title || next.Id}
              </div>
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
