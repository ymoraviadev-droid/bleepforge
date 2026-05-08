import { Link } from "react-router";
import type { Npc } from "@bleepforge/shared";
import { AssetThumb } from "../components/AssetThumb";
import { PortraitPlaceholder } from "../components/PixelPlaceholder";

interface Props {
  npc: Npc;
  className?: string;
}

export function NpcRow({ npc, className = "" }: Props) {
  const questCount = npc.Quests.length;
  const lootCount = npc.LootTable?.Entries.length ?? 0;

  return (
    <Link
      to={`/npcs/${encodeURIComponent(npc.NpcId)}`}
      className={`${className} flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      {npc.Portrait ? (
        <AssetThumb path={npc.Portrait} size="xs" />
      ) : (
        <PortraitPlaceholder
          className="size-8 shrink-0 rounded border border-neutral-800 bg-neutral-950 p-0.5"
          title={`No portrait for ${npc.NpcId}`}
        />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 truncate font-mono text-[11px] text-neutral-500">
          {npc.NpcId}
        </span>
        <span className="shrink-0 truncate text-sm text-neutral-100">
          {npc.DisplayName || (
            <span className="italic text-neutral-500">{npc.NpcId}</span>
          )}
        </span>
        {npc.MemoryEntryId && (
          <span className="hidden shrink-0 truncate text-[10px] text-neutral-400 sm:inline">
            <span className="text-neutral-600">model:</span>{" "}
            <span className="font-mono">{npc.MemoryEntryId}</span>
          </span>
        )}
        {npc.DefaultDialog && (
          <span
            className="hidden min-w-0 flex-1 truncate text-[10px] text-neutral-500 lg:inline"
            title={`Default dialog: ${npc.DefaultDialog}`}
          >
            <span className="text-emerald-400/60">dialog:</span>{" "}
            <span className="font-mono">{npc.DefaultDialog}</span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {questCount > 0 && (
          <Badge
            className="border-amber-900 bg-amber-950/50 text-amber-200"
            title={`${questCount} quest entries linked`}
          >
            {questCount}× quest
          </Badge>
        )}
        {lootCount > 0 && (
          <Badge
            className="border-neutral-700 bg-neutral-800 text-neutral-200"
            title={`${lootCount} loot entries`}
          >
            {lootCount}× loot
          </Badge>
        )}
        {npc.CasualRemarks.length > 0 && (
          <Badge
            className="border-sky-800 bg-sky-950/50 text-sky-200"
            title={`${npc.CasualRemarks.length} casual remark balloon${npc.CasualRemarks.length === 1 ? "" : "s"}`}
          >
            {npc.CasualRemarks.length === 1
              ? "balloon"
              : `${npc.CasualRemarks.length}× balloons`}
          </Badge>
        )}
        {npc.DeathImpactId && (
          <Badge
            className="border-red-800 bg-red-950/50 text-red-200"
            title={`Death impact: ${npc.DeathImpactId}`}
          >
            karma
          </Badge>
        )}
      </div>
    </Link>
  );
}

function Badge({
  className = "",
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`${className} inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide`}
    >
      {children}
    </span>
  );
}
