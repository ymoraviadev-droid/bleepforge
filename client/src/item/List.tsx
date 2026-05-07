import { useEffect, useMemo, useState } from "react";
import type { Item, ItemCategory } from "@bleepforge/shared";
import { itemsApi } from "../api";
import { ButtonLink } from "../Button";
import { textInput } from "../ui";
import { ItemCard } from "./ItemCard";

const CATEGORIES: ItemCategory[] = [
  "Misc",
  "Weapon",
  "QuestItem",
  "Upgrade",
  "Consumable",
];

type SortBy = "slug" | "name" | "price-desc";

const SORT_LABEL: Record<SortBy, string> = {
  slug: "slug",
  name: "name",
  "price-desc": "price ↓",
};

export function ItemList() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState<Set<ItemCategory>>(new Set(CATEGORIES));
  const [sortBy, setSortBy] = useState<SortBy>("slug");

  useEffect(() => {
    itemsApi.list().then(setItems).catch((e) => setError(String(e)));
  }, []);

  const grouped = useMemo(() => {
    if (!items) return null;
    const q = search.toLowerCase().trim();
    const filtered = items.filter((i) => {
      if (!enabled.has(i.Category)) return false;
      if (!q) return true;
      return (
        i.Slug.toLowerCase().includes(q) ||
        i.DisplayName.toLowerCase().includes(q) ||
        i.Description.toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "slug":
          return a.Slug.localeCompare(b.Slug);
        case "name":
          return (a.DisplayName || a.Slug).localeCompare(b.DisplayName || b.Slug);
        case "price-desc":
          return b.Price - a.Price || a.Slug.localeCompare(b.Slug);
      }
    });
    const map = new Map<ItemCategory, Item[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const item of sorted) map.get(item.Category)!.push(item);
    return map;
  }, [items, search, enabled, sortBy]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (items === null || grouped === null)
    return <div className="text-neutral-500">Loading…</div>;

  const totalShown = Array.from(grouped.values()).reduce((n, l) => n + l.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Items{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== items.length ? ` / ${items.length}` : ""})
          </span>
        </h1>
        <ButtonLink to="/items/new">New</ButtonLink>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="search slug, name, description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${textInput} mt-0 max-w-xs flex-1`}
        />
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
        <div className="ml-auto flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => {
            const on = enabled.has(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  const next = new Set(enabled);
                  if (on) next.delete(cat);
                  else next.add(cat);
                  setEnabled(next);
                }}
                className={`rounded border px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                  on
                    ? "border-emerald-700 bg-emerald-950/60 text-emerald-200"
                    : "border-neutral-800 bg-neutral-900 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-neutral-500">No items yet.</p>
      ) : totalShown === 0 ? (
        <p className="text-neutral-500">No items match the current filter.</p>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const list = grouped.get(cat)!;
            if (list.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {cat}
                  <span className="text-[10px] text-neutral-600">
                    ({list.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {list.map((item) => (
                    <ItemCard key={item.Slug} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
