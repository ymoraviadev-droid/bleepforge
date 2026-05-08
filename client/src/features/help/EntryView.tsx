import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  compareEntries,
  type HelpCategoryGroup,
  type HelpCategoryMeta,
  type HelpEntry,
} from "@bleepforge/shared";
import { helpApi } from "../../lib/api";
import { useDevMode } from "../../lib/useDevMode";
import { ButtonLink } from "../../components/Button";
import { NotFoundPage } from "../../components/NotFoundPage";
import { paletteColorClasses } from "../../lib/paletteColor";
import { HelpSidebar } from "./HelpSidebar";
import { RenderHelpBody } from "./render";

// Single help entry view. Three sections: persistent HelpSidebar on the
// left listing every category and entry in the library (the active entry
// is highlighted), rendered body in the middle, and a Prev/Next pager
// walking the in-section ordering of the active category.

export function EntryView() {
  const { category, id } = useParams();
  const [meta, setMeta] = useState<HelpCategoryMeta | null>(null);
  const [entry, setEntry] = useState<HelpEntry | null>(null);
  const [siblings, setSiblings] = useState<HelpEntry[] | null>(null);
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
      .then(setSiblings)
      .catch((e) => setError(String(e)));
    helpApi.listAll().then(setAllGroups).catch(() => setAllGroups([]));
  }, [category]);

  useEffect(() => {
    if (!category || !id) return;
    helpApi
      .getEntry(category, id)
      .then((e) => (e === null ? setError("not found") : setEntry(e)))
      .catch((e) => setError(String(e)));
  }, [category, id]);

  const sortedSiblings = useMemo(() => {
    if (!siblings) return null;
    return [...siblings].sort(compareEntries);
  }, [siblings]);

  const navIndex = useMemo(() => {
    if (!sortedSiblings || !entry) return -1;
    return sortedSiblings.findIndex((s) => s.Id === entry.Id);
  }, [sortedSiblings, entry]);

  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (!meta || !entry || !sortedSiblings || !category)
    return <div className="text-neutral-500">Loading…</div>;

  const colors = paletteColorClasses(meta.Color);
  const categoryDisplay = meta.DisplayName || category;
  const prev = navIndex > 0 ? sortedSiblings[navIndex - 1] : null;
  const next =
    navIndex >= 0 && navIndex < sortedSiblings.length - 1
      ? sortedSiblings[navIndex + 1]
      : null;

  return (
    <div className="mx-auto max-w-7xl">
      <nav className="mb-4 flex items-center gap-2 text-xs text-neutral-500">
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        {allGroups && (
          <HelpSidebar
            groups={allGroups}
            activeCategory={category}
            activeEntryId={entry.Id}
          />
        )}

        <article className="min-w-0 space-y-6">
          <header className="space-y-2 border-b-2 border-neutral-800 pb-4">
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="text-2xl font-semibold text-neutral-100">
                {entry.Title || entry.Id}
              </h1>
              {devMode && (
                <ButtonLink
                  to={`/help/${encodeURIComponent(category)}/${encodeURIComponent(entry.Id)}/edit`}
                  size="sm"
                  variant="secondary"
                >
                  edit
                </ButtonLink>
              )}
            </div>
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
                  updated {new Date(entry.UpdatedAt).toLocaleDateString()}
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
      </div>
    </div>
  );
}
