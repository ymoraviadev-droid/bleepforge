import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  compareCategories,
  type HelpCategoryGroup,
  type HelpEntry,
} from "@bleepforge/shared";
import { helpApi } from "../../lib/api";
import { useDevMode } from "../../lib/useDevMode";
import { ButtonLink } from "../../components/Button";
import { paletteColorClasses } from "../../lib/paletteColor";
import { HelpHero } from "./HelpHero";
import { HelpSearch } from "./HelpSearch";
import { HelpSidebar } from "./HelpSidebar";

// Top-level Help landing page. The persistent sidebar on the left lets
// the user drill in by category; the main panel is a welcome screen
// that promotes the two ways to find content (search across everything,
// or pick a category from the sidebar). A short "Start here" row
// surfaces three hand-picked entries so first-time users have an
// obvious path in. A "Browse by topic" chip grid mirrors the sidebar
// in compact form, useful on mobile where the sidebar stacks above the
// content rather than next to it.

// Featured entries that appear under "Start here" on the welcome screen.
// Each entry is referenced by category + id, in display order. Falls
// back gracefully if any of them are missing from the seed (e.g. the
// user deleted one): the row only renders the entries it can resolve.
const STARTER_PICKS: { category: string; id: string }[] = [
  { category: "getting-started", id: "welcome" },
  { category: "getting-started", id: "project-root" },
  { category: "editor-basics", id: "app-search" },
];

export function List() {
  const [groups, setGroups] = useState<HelpCategoryGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const devMode = useDevMode();

  useEffect(() => {
    helpApi.listAll().then(setGroups).catch((e) => setError(String(e)));
  }, []);

  const sortedGroups = useMemo(() => {
    if (!groups) return null;
    return [...groups].sort(compareCategories);
  }, [groups]);

  const starterEntries = useMemo<
    { category: string; meta: HelpCategoryGroup["meta"]; entry: HelpEntry }[]
  >(() => {
    if (!groups) return [];
    const out: { category: string; meta: HelpCategoryGroup["meta"]; entry: HelpEntry }[] = [];
    for (const pick of STARTER_PICKS) {
      const group = groups.find((g) => g.category === pick.category);
      if (!group) continue;
      const entry = group.entries.find((e) => e.Id === pick.id);
      if (!entry) continue;
      out.push({ category: pick.category, meta: group.meta, entry });
    }
    return out;
  }, [groups]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (groups === null || sortedGroups === null)
    return <div className="text-neutral-500">Loading…</div>;

  const totalEntries = groups.reduce((acc, g) => acc + g.entries.length, 0);

  if (groups.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-16 text-center">
        <h1 className="font-display text-sm uppercase tracking-wider text-neutral-300">
          The help library is empty
        </h1>
        <p className="text-sm leading-relaxed text-neutral-500">
          No categories have been created yet. Help content lives under{" "}
          <code className="border border-neutral-800 bg-neutral-900 px-1 font-mono text-xs">
            data/help/
          </code>{" "}
          and authoring is gated by the{" "}
          <code className="border border-neutral-800 bg-neutral-900 px-1 font-mono text-xs">
            BLEEPFORGE_DEV_MODE
          </code>{" "}
          env var. Set it to{" "}
          <code className="border border-neutral-800 bg-neutral-900 px-1 font-mono text-xs">
            1
          </code>{" "}
          and restart the server to enable editing.
        </p>
        {devMode && (
          <ButtonLink to="/help/new" size="sm">
            + New category
          </ButtonLink>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      <HelpSidebar groups={groups} />

      <div className="min-w-0 space-y-10">
        <section className="flex flex-col gap-6 border-2 border-neutral-800 bg-neutral-950/40 p-6 sm:flex-row sm:items-center sm:gap-8">
          <HelpHero className="size-40 shrink-0 self-center text-neutral-400 sm:size-48" />
          <div className="flex-1 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="font-display text-base uppercase tracking-wider text-emerald-300">
                Help library
              </h1>
              {devMode && (
                <ButtonLink to="/help/new" size="sm" variant="secondary">
                  + New category
                </ButtonLink>
              )}
            </div>
            <p className="text-sm leading-relaxed text-neutral-300">
              A library of how things work in Bleepforge. Pick a topic from the
              left, or search across every entry below.
            </p>
            <p className="text-xs text-neutral-500">
              {groups.length} categor{groups.length === 1 ? "y" : "ies"}, {" "}
              {totalEntries} entr{totalEntries === 1 ? "y" : "ies"}.
              Press <kbd className="mx-0.5 inline-flex items-center border border-neutral-700 bg-neutral-950 px-1 font-mono text-[10px] text-neutral-300">/</kbd> from
              anywhere on a Help page to focus the search.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xs uppercase tracking-wider text-neutral-400">
            Search
          </h2>
          <HelpSearch groups={groups} />
        </section>

        {starterEntries.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-xs uppercase tracking-wider text-neutral-400">
              Start here
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {starterEntries.map(({ category, meta, entry }) => {
                const colors = paletteColorClasses(meta.Color);
                return (
                  <li key={`${category}/${entry.Id}`}>
                    <Link
                      to={`/help/${encodeURIComponent(category)}/${encodeURIComponent(entry.Id)}`}
                      className={`group flex h-full flex-col gap-1 border ${colors.border} bg-neutral-900/50 px-3 py-3 transition-colors ${colors.borderHover} hover:bg-neutral-900`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                        <span className={`inline-block size-1.5 ${colors.stripe}`} />
                        <span className={colors.text}>
                          {meta.DisplayName || category}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-neutral-200 group-hover:text-neutral-100">
                        {entry.Title || entry.Id}
                      </span>
                      {entry.Summary && (
                        <span className="text-[11px] leading-snug text-neutral-500">
                          {entry.Summary}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-xs uppercase tracking-wider text-neutral-400">
            Browse by topic
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sortedGroups.map((group) => {
              const colors = paletteColorClasses(group.meta.Color);
              const display = group.meta.DisplayName || group.category;
              return (
                <li key={group.category}>
                  <Link
                    to={`/help/${encodeURIComponent(group.category)}`}
                    className={`group flex h-full items-center gap-2 border-2 ${colors.border} ${colors.surface} px-3 py-3 transition-colors ${colors.borderHover}`}
                  >
                    <span className={`inline-block size-2 ${colors.stripe}`} />
                    <span className={`flex-1 truncate text-sm font-medium ${colors.text}`}>
                      {display}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {group.entries.length}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
