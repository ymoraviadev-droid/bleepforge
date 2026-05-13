import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { groupEntriesBySection } from "@bleepforge/shared";
import { NotFoundPage } from "../../components/NotFoundPage";
import { paletteColorClasses } from "../../lib/paletteColor";
import { useHelpLayout } from "./HelpLayout";
import { HelpSearch } from "./HelpSearch";

import { PixelSkeleton } from "../../components/PixelSkeleton";
// Per-category landing page. Lists every entry in the active category
// grouped by Section, with the in-page Help search scoped to this
// category at the top. The full library is one click away via the
// breadcrumb. Sidebar + wrapper come from HelpLayout; this component
// renders only its content area into the outlet.

export function CategoryView() {
  const { category } = useParams();
  const { allGroups } = useHelpLayout();

  const group = useMemo(() => {
    if (!allGroups || !category) return null;
    return allGroups.find((g) => g.category === category) ?? null;
  }, [allGroups, category]);

  const sections = useMemo(() => {
    if (!group) return null;
    return groupEntriesBySection(group.entries);
  }, [group]);

  if (allGroups === null || !category)
    return <PixelSkeleton />;
  if (!group || !sections) return <NotFoundPage />;

  const meta = group.meta;
  const entries = group.entries;
  const colors = paletteColorClasses(meta.Color);
  const display = meta.DisplayName || category;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <nav className="flex items-center gap-2 text-xs text-neutral-500">
          <Link to="/help" className="hover:text-neutral-300">
            Help
          </Link>
          <span className="text-neutral-700">/</span>
          <span className={colors.text}>{display}</span>
        </nav>
        <div className="flex items-baseline gap-3">
          <span className={`inline-block size-3 ${colors.stripe}`} />
          <h1
            className={`font-display text-base uppercase tracking-wider ${colors.text}`}
          >
            {display}
          </h1>
          <span className="text-[10px] text-neutral-500">
            ({entries.length} entr{entries.length === 1 ? "y" : "ies"})
          </span>
        </div>
        {meta.Description && (
          <p className="text-sm leading-relaxed text-neutral-400">
            {meta.Description}
          </p>
        )}
      </header>

      <HelpSearch groups={allGroups} scopeCategory={category} />

      {entries.length === 0 ? (
        <p className="text-sm italic text-neutral-600">
          No entries in this category yet.
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((sec) => (
            <div key={sec.section}>
              {sec.section && (
                <h2 className="mb-2 border-b border-neutral-800 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {sec.section}
                </h2>
              )}
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sec.entries.map((entry) => (
                  <li key={entry.Id}>
                    <Link
                      to={`/help/${encodeURIComponent(category)}/${encodeURIComponent(entry.Id)}`}
                      className={`group flex flex-col gap-0.5 border ${colors.border} bg-neutral-900/50 px-3 py-2 transition-colors ${colors.borderHover} hover:bg-neutral-900`}
                    >
                      <span className="text-sm text-neutral-200 group-hover:text-neutral-100">
                        {entry.Title || entry.Id}
                      </span>
                      {entry.Summary && (
                        <span className="text-[11px] leading-snug text-neutral-500">
                          {entry.Summary}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
