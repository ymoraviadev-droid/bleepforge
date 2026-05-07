import { Link } from "react-router";
import type { Item, ItemCategory } from "@bleepforge/shared";
import { ItemIcon } from "../ItemIcon";

interface Props {
  item: Item;
  className?: string;
}

// Reusable item card. Used in the items list (small/medium grid) and any
// other place that needs a compact item summary with icon + scalars.

const CATEGORY_BADGE: Record<ItemCategory, string> = {
  Misc: "bg-neutral-800 text-neutral-300 border-neutral-700",
  Weapon: "bg-red-950/60 text-red-200 border-red-800",
  QuestItem: "bg-amber-950/60 text-amber-200 border-amber-800",
  Upgrade: "bg-sky-950/60 text-sky-200 border-sky-800",
  Consumable: "bg-emerald-950/60 text-emerald-200 border-emerald-800",
};

export function ItemCard({ item, className = "" }: Props) {
  const showMaxStack = item.IsStackable && item.MaxStack !== 99;

  return (
    <Link
      to={`/items/${encodeURIComponent(item.Slug)}`}
      className={`${className} flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      <div className="flex items-start gap-3">
        <ItemIcon slug={item.Slug} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] text-neutral-500">
            {item.Slug}
          </div>
          <div className="truncate text-sm font-medium text-neutral-100">
            {item.DisplayName || (
              <span className="italic text-neutral-500">unnamed</span>
            )}
          </div>
        </div>
      </div>

      {item.Description && (
        <p className="line-clamp-2 text-xs text-neutral-400">{item.Description}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Badge className={CATEGORY_BADGE[item.Category]}>{item.Category}</Badge>
        {item.Price > 0 && (
          <Badge className="border-neutral-700 bg-neutral-800 text-neutral-200">
            {item.Price}c
          </Badge>
        )}
        {!item.IsStackable && (
          <Badge className="border-neutral-800 bg-neutral-900 text-neutral-500">
            no-stack
          </Badge>
        )}
        {showMaxStack && (
          <Badge className="border-neutral-700 bg-neutral-800 text-neutral-300">
            ×{item.MaxStack}
          </Badge>
        )}
        {item.Category === "QuestItem" && item.QuestId && (
          <Badge className="border-amber-900 bg-amber-950/50 text-amber-300">
            quest: {item.QuestId}
          </Badge>
        )}
      </div>
    </Link>
  );
}

function Badge({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`${className} inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide`}
    >
      {children}
    </span>
  );
}
