import { Link } from "react-router";
import type { Npc } from "@bleepforge/shared";
import { AssetThumb } from "../AssetThumb";
import { PortraitPlaceholder } from "../PixelPlaceholder";

interface Props {
  npc: Npc;
  className?: string;
}

export function NpcCard({ npc, className = "" }: Props) {
  const lootCount = npc.LootTable?.Entries.length ?? 0;
  const questCount = npc.Quests.length;

  return (
    <Link
      to={`/npcs/${encodeURIComponent(npc.NpcId)}`}
      className={`${className} flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      <div className="flex items-start gap-3">
        {npc.Portrait ? (
          <AssetThumb path={npc.Portrait} size="md" />
        ) : (
          <PortraitPlaceholder
            className="size-14"
            title={`No portrait for ${npc.NpcId}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-neutral-100">
            {npc.DisplayName || (
              <span className="italic font-normal text-neutral-500">
                {npc.NpcId}
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-neutral-500">
            {npc.NpcId}
          </div>
          {npc.MemoryEntryId && (
            <div className="mt-0.5 truncate text-[10px] text-neutral-400">
              <span className="text-neutral-600">model:</span>{" "}
              <span className="font-mono">{npc.MemoryEntryId}</span>
            </div>
          )}
        </div>
      </div>

      {(questCount > 0 ||
        lootCount > 0 ||
        npc.DefaultDialog ||
        npc.CasualRemark ||
        npc.DeathImpactId) && (
        <div className="flex flex-wrap gap-1.5">
          {questCount > 0 && (
            <Badge
              className="border-amber-900 bg-amber-950/50 text-amber-200"
              title={`${questCount} quest entries linked`}
            >
              {questCount}× quest
            </Badge>
          )}
          {npc.DefaultDialog && (
            <Badge
              className="border-emerald-800 bg-emerald-950/50 text-emerald-200"
              title={`Default dialog: ${npc.DefaultDialog}`}
            >
              dialog
            </Badge>
          )}
          {npc.CasualRemark && (
            <Badge
              className="border-sky-800 bg-sky-950/50 text-sky-200"
              title="Has a casual remark balloon"
            >
              balloon
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
          {npc.DeathImpactId && (
            <Badge
              className="border-red-800 bg-red-950/50 text-red-200"
              title={`Death impact: ${npc.DeathImpactId}`}
            >
              karma
            </Badge>
          )}
        </div>
      )}
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
