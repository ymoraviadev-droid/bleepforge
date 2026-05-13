import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { CodexCategoryGroup } from "@bleepforge/shared";
import { codexApi } from "../../lib/api";
import { ButtonLink } from "../../components/Button";
import { BookEmpty, EmptyState } from "../../components/EmptyState";
import { textInput } from "../../styles/classes";
import { CARDS_LIST_OPTIONS, useViewMode, ViewToggle } from "../../components/ViewToggle";
import { CodexCard } from "./CodexCard";
import { CodexRow } from "./CodexRow";
import { categoryColorClasses } from "./categoryColor";

import { PixelSkeleton } from "../../components/PixelSkeleton";
type SortBy = "id" | "name";

const SORT_LABEL: Record<SortBy, string> = {
  id: "id",
  name: "name",
};

// Codex list page. Groups by category, with per-category section
// headers tinted by Color. The ?category= query param scopes the view
// to a single category — used by the back-link from the entry edit
// page so users return to "their" category, not the whole list.

export function List() {
  const [groups, setGroups] = useState<CodexCategoryGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [view, setView] = useViewMode("codex");

  const activeCategory = searchParams.get("category") ?? "";

  useEffect(() => {
    codexApi.listAll().then(setGroups).catch((e) => setError(String(e)));
  }, []);

  const filteredGroups = useMemo(() => {
    if (!groups) return null;
    const q = search.toLowerCase().trim();
    return groups
      .filter((g) => !activeCategory || g.category === activeCategory)
      .map((g) => {
        const filtered = q
          ? g.entries.filter(
              (e) =>
                e.Id.toLowerCase().includes(q) ||
                e.DisplayName.toLowerCase().includes(q) ||
                e.Description.toLowerCase().includes(q),
            )
          : g.entries;
        const sorted = [...filtered].sort((a, b) =>
          sortBy === "id"
            ? a.Id.localeCompare(b.Id)
            : (a.DisplayName || a.Id).localeCompare(b.DisplayName || b.Id),
        );
        return { ...g, entries: sorted };
      });
  }, [groups, search, sortBy, activeCategory]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (groups === null || filteredGroups === null)
    return <PixelSkeleton />;

  const totalCategories = groups.length;
  const totalShown = filteredGroups.reduce((acc, g) => acc + g.entries.length, 0);
  const totalAll = groups.reduce((acc, g) => acc + g.entries.length, 0);

  // Empty-state path: no categories on disk at all. Show the BookEmpty
  // illustration with a single "+ New category" CTA.
  if (totalCategories === 0) {
    return (
      <EmptyState
        illustration={<BookEmpty className="size-32" />}
        title="The codex is empty"
        body={
          <>
            The Codex is your project notebook for things that don't fit the
            seven game-domain authoring surfaces. Define a category (e.g.
            Hazards, Locations, Vehicles) with its own properties, then start
            filling it in.
          </>
        }
        action={{ label: "+ New category", href: "/codex/new" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Game codex{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== totalAll ? ` / ${totalAll}` : ""})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ButtonLink to="/codex/new" size="sm" variant="secondary">
            + New category
          </ButtonLink>
          <ViewToggle mode={view} onChange={setView} options={CARDS_LIST_OPTIONS} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="search id, name, description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${textInput} mt-0 max-w-xs flex-1`}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          category
          <select
            value={activeCategory}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setSearchParams({ category: v });
              else setSearchParams({});
            }}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {groups.map((g) => (
              <option key={g.category} value={g.category}>
                {g.meta.DisplayName || g.category} ({g.entries.length})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={`${textInput} mt-0 w-auto`}
          >
            {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totalShown === 0 && search ? (
        <p className="text-neutral-500">No entries match the current filter.</p>
      ) : (
        <div className="space-y-8">
          {filteredGroups.map((g) => {
            const colors = categoryColorClasses(g.meta.Color);
            return (
              <section key={g.category}>
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-neutral-800/70 pb-1">
                  <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide">
                    <span className={`inline-block size-2 ${colors.stripe}`} />
                    <span className={colors.text}>
                      {g.meta.DisplayName || g.category}
                    </span>
                    <span className="text-[10px] text-neutral-600">
                      ({g.entries.length})
                    </span>
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <ButtonLink
                      to={`/codex/${encodeURIComponent(g.category)}/_meta`}
                      size="sm"
                      variant="ghost"
                    >
                      edit schema
                    </ButtonLink>
                    <ButtonLink
                      to={`/codex/${encodeURIComponent(g.category)}/new`}
                      size="sm"
                      variant="secondary"
                    >
                      + entry
                    </ButtonLink>
                  </div>
                </div>
                {g.entries.length === 0 ? (
                  <p className="px-2 py-3 text-xs italic text-neutral-600">
                    No entries in this category yet.{" "}
                    <ButtonLink
                      to={`/codex/${encodeURIComponent(g.category)}/new`}
                      size="sm"
                      variant="ghost"
                    >
                      + Create the first one
                    </ButtonLink>
                  </p>
                ) : view === "cards" ? (
                  <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {g.entries.map((entry) => (
                      <CodexCard key={entry.Id} entry={entry} meta={g.meta} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {g.entries.map((entry) => (
                      <CodexRow key={entry.Id} entry={entry} meta={g.meta} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

