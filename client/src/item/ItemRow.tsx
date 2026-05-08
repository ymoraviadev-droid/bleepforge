import { Link } from "react-router";
import type { Item, ItemCategory } from "@bleepforge/shared";
import { ItemIcon } from "../ItemIcon";

interface Props {
  item: Item;
  className?: string;
}

const CATEGORY_BADGE: Record<ItemCategory, string> = {
  Misc: "bg-neutral-800 text-neutral-300 border-neutral-700",
  Weapon: "bg-red-950/60 text-red-200 border-red-800",
  QuestItem: "bg-amber-950/60 text-amber-200 border-amber-800",
  Upgrade: "bg-sky-950/60 text-sky-200 border-sky-800",
  Consumable: "bg-emerald-950/60 text-emerald-200 border-emerald-800",
};

export function ItemRow({ item, className = "" }: Props) {
  const showMaxStack = item.IsStackable && item.MaxStack !== 99;
  return (
    <Link
      to={`/items/${encodeURIComponent(item.Slug)}`}
      className={`${className} flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      <ItemIcon slug={item.Slug} size="xs" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 truncate font-mono text-[11px] text-neutral-500">
          {item.Slug}
        </span>
        <span className="shrink-0 truncate text-sm text-neutral-100">
          {item.DisplayName || (
            <span className="italic text-neutral-500">unnamed</span>
          )}
        </span>
        {item.Description && (
          <span className="hidden min-w-0 flex-1 truncate text-xs text-neutral-500 sm:block">
            {item.Description}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
