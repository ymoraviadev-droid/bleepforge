import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Item } from "@bleepforge/shared";
import { itemsApi } from "../api";
import { AssetThumb } from "../AssetThumb";
import { ButtonLink } from "../Button";

export function ItemList() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    itemsApi.list().then(setItems).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (items === null) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Items</h1>
        <ButtonLink to="/items/new">New</ButtonLink>
      </div>
      {items.length === 0 ? (
        <p className="text-neutral-500">No items yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {items.map((it) => (
            <li key={it.Slug} className="hover:bg-neutral-900">
              <Link
                to={`/items/${encodeURIComponent(it.Slug)}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <AssetThumb path={it.Icon} size="md" />
                <div className="min-w-0">
                  <div className="font-mono text-sm text-neutral-100">{it.Slug}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {it.DisplayName || "(unnamed)"} · {it.Category}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
