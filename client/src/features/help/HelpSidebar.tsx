import { Link, useParams } from "react-router";
import {
  compareCategories,
  groupEntriesBySection,
  type HelpCategoryGroup,
} from "@bleepforge/shared";
import { paletteColorClasses } from "../../lib/paletteColor";

// Persistent navigation rail used by every Help page (List, CategoryView,
// EntryView). Renders the full library as a tree: category headers with
// color stripes, entries grouped by Section underneath. The active entry
// is highlighted; the active category's header gets a subtle accent so
// you can see "you are here" even when no entry is active (e.g. on the
// List or CategoryView routes).
//
// Active state is derived from the current URL via useParams() rather
// than threaded as props. With HelpLayout owning a single instance of
// this sidebar across all help routes, the alternative would require
// the layout to readroute params and pass them down — and Outlet-
// rendered children can't push back into a parent's props anyway.

interface HelpSidebarProps {
  groups: HelpCategoryGroup[];
}

export function HelpSidebar({ groups }: HelpSidebarProps) {
  const params = useParams();
  const activeCategory = params.category;
  const activeEntryId = params.id;
  const sorted = [...groups].sort(compareCategories);

  return (
    <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:self-start">
      <nav className="space-y-4 pr-2">
        <Link
          to="/help"
          className="block font-display text-xs uppercase tracking-wider text-emerald-300 hover:text-emerald-200"
        >
          Help library
        </Link>
        <ul className="space-y-5">
          {sorted.map((group) => {
            const colors = paletteColorClasses(group.meta.Color);
            const display = group.meta.DisplayName || group.category;
            const isActiveCategory = activeCategory === group.category;
            const sections = groupEntriesBySection(group.entries);
            return (
              <li key={group.category}>
                <Link
                  to={`/help/${encodeURIComponent(group.category)}`}
                  className={`flex items-baseline gap-2 border-l-2 pl-2 transition-colors ${
                    isActiveCategory
                      ? `${colors.border} ${colors.bgTint}`
                      : "border-transparent hover:border-neutral-700"
                  }`}
                >
                  <span className={`inline-block size-2 ${colors.stripe}`} />
                  <span
                    className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}
                  >
                    {display}
                  </span>
                  <span className="text-[10px] text-neutral-600">
                    ({group.entries.length})
                  </span>
                </Link>

                {group.entries.length > 0 && (
                  <ul className="mt-1.5 space-y-2 pl-3">
                    {sections.map((sec) => (
                      <li key={sec.section}>
                        {sec.section && (
                          <div className="mb-1 text-[9px] uppercase tracking-wider text-neutral-600">
                            {sec.section}
                          </div>
                        )}
                        <ul className="space-y-px">
                          {sec.entries.map((entry) => {
                            const isActive = activeEntryId === entry.Id && isActiveCategory;
                            return (
                              <li key={entry.Id}>
                                <Link
                                  to={`/help/${encodeURIComponent(group.category)}/${encodeURIComponent(entry.Id)}`}
                                  className={`block border-l-2 px-2 py-0.5 text-xs transition-colors ${
                                    isActive
                                      ? `${colors.border} ${colors.bgTint} text-neutral-100`
                                      : "border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
                                  }`}
                                >
                                  {entry.Title || entry.Id}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
