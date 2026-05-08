import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  groupEntriesBySection,
  type HelpCategoryGroup,
  type HelpCategoryMeta,
  type HelpEntry,
} from "@bleepforge/shared";
import { helpApi } from "../../lib/api";
import { useDevMode } from "../../lib/useDevMode";
import { ButtonLink } from "../../components/Button";
import { NotFoundPage } from "../../components/NotFoundPage";
import { paletteColorClasses } from "../../lib/paletteColor";
import { HelpSearch } from "./HelpSearch";
import { HelpSidebar } from "./HelpSidebar";

// Per-category landing page. Lists every entry in the active category
// grouped by Section, with the in-page Help search scoped to this
// category at the top. The full library is one click away via the
// breadcrumb.

export function CategoryView() {
  const { category } = useParams();
  const [meta, setMeta] = useState<HelpCategoryMeta | null>(null);
  const [entries, setEntries] = useState<HelpEntry[] | null>(null);
  const [allGroups, setAllGroups] = useState<HelpCategoryGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const devMode = useDevMode();

  useEffect(() => {
    if (!category) return;
    helpApi
      .getMeta(category)
      .then((m) => (m === null ? setError("not found") : setMeta(m)))
      .catch((e) => setError(String(e)));
    helpApi
      .listInCategory(category)
      .then(setEntries)
      .catch((e) => setError(String(e)));
    // Search scope is this category, but we still load the full corpus
    // so HelpSearch can hand the user a result anywhere in the library
    // if their query doesn't match the active scope.
    helpApi.listAll().then(setAllGroups).catch(() => setAllGroups([]));
  }, [category]);

  const sections = useMemo(() => {
    if (!entries) return null;
    return groupEntriesBySection(entries);
  }, [entries]);

  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (!meta || entries === null || sections === null || !category)
    return <div className="text-neutral-500">Loading…</div>;

  const colors = paletteColorClasses(meta.Color);
  const display = meta.DisplayName || category;

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      {allGroups && (
        <HelpSidebar groups={allGroups} activeCategory={category} />
      )}
      <div className="min-w-0 space-y-8">
      <header className="space-y-3">
        <nav className="flex items-center gap-2 text-xs text-neutral-500">
          <Link to="/help" className="hover:text-neutral-300">
            Help
          </Link>
          <span className="text-neutral-700">/</span>
          <span className={colors.text}>{display}</span>
        </nav>
        <div className="flex items-baseline justify-between gap-4">
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
          {devMode && (
            <div className="flex items-center gap-2">
              <ButtonLink
                to={`/help/${encodeURIComponent(category)}/_meta`}
                size="sm"
                variant="ghost"
              >
                edit category
              </ButtonLink>
              <ButtonLink
                to={`/help/${encodeURIComponent(category)}/new`}
                size="sm"
                variant="secondary"
              >
                + entry
              </ButtonLink>
            </div>
          )}
        </div>
        {meta.Description && (
          <p className="text-sm leading-relaxed text-neutral-400">
            {meta.Description}
          </p>
        )}
      </header>

      {allGroups && <HelpSearch groups={allGroups} scopeCategory={category} />}

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
    </div>
  );
}
