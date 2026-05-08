import { Link } from "react-router";
import type { Npc, Quest } from "@bleepforge/shared";
import { AssetThumb } from "../../components/AssetThumb";
import { PortraitPlaceholder } from "../../components/PixelPlaceholder";

interface Props {
  quest: Quest;
  giver?: Npc;
  className?: string;
}

const OBJECTIVE_BADGE: Record<string, string> = {
  CollectItem: "bg-amber-950/60 text-amber-200 border-amber-800",
  ReachLocation: "bg-sky-950/60 text-sky-200 border-sky-800",
  TalkToNpc: "bg-emerald-950/60 text-emerald-200 border-emerald-800",
  KillNpc: "bg-red-950/60 text-red-200 border-red-800",
  KillEnemyType: "bg-rose-950/60 text-rose-200 border-rose-800",
};

const OBJECTIVE_LABEL: Record<string, string> = {
  CollectItem: "collect",
  ReachLocation: "reach",
  TalkToNpc: "talk",
  KillNpc: "kill",
  KillEnemyType: "kill type",
};

export function QuestRow({ quest, giver, className = "" }: Props) {
  const objCounts: Record<string, number> = {};
  for (const o of quest.Objectives) {
    objCounts[o.Type] = (objCounts[o.Type] ?? 0) + 1;
  }

  let itemRewards = 0;
  let creditRewards = 0;
  let flagRewards = 0;
  for (const r of quest.Rewards) {
    if (r.Type === "Item") itemRewards += Math.max(1, r.Quantity);
    else if (r.Type === "Credits") creditRewards += r.CreditAmount;
    else if (r.Type === "Flag") flagRewards += 1;
  }

  return (
    <Link
      to={`/quests/${encodeURIComponent(quest.Id)}`}
      className={`${className} flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      {giver?.Portrait ? (
        <AssetThumb path={giver.Portrait} size="xs" />
      ) : (
        <PortraitPlaceholder
          className="size-8 shrink-0 rounded border border-neutral-800 bg-neutral-950 p-0.5"
          title={
            quest.QuestGiverId
              ? `No portrait for ${quest.QuestGiverId}`
              : "No quest giver"
          }
        />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 truncate font-mono text-[11px] text-neutral-500">
          {quest.Id}
        </span>
        <span className="shrink-0 truncate text-sm text-neutral-100">
          {quest.Title || (
            <span className="italic text-neutral-500">untitled</span>
          )}
        </span>
        {quest.Description && (
          <span className="hidden min-w-0 flex-1 truncate text-xs text-neutral-500 sm:block">
            {quest.Description}
          </span>
        )}
        {quest.QuestGiverId && (
          <span
            className="hidden shrink-0 truncate text-[10px] text-neutral-500 lg:inline"
            title={`Giver: ${quest.QuestGiverId}`}
          >
            <span className="text-neutral-600">giver:</span>{" "}
            {giver?.DisplayName || quest.QuestGiverId}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {Object.entries(objCounts).map(([type, n]) => (
          <Badge
            key={type}
            className={
              OBJECTIVE_BADGE[type] ??
              "bg-neutral-800 text-neutral-300 border-neutral-700"
            }
            title={`${n} ${type} objective${n > 1 ? "s" : ""}`}
          >
            {n}× {OBJECTIVE_LABEL[type] ?? type}
          </Badge>
        ))}
        {creditRewards > 0 && (
          <Badge
            className="border-emerald-800 bg-emerald-950/50 text-emerald-200"
            title={`${creditRewards} credits reward`}
          >
            {creditRewards}c
          </Badge>
        )}
        {itemRewards > 0 && (
          <Badge
            className="border-amber-900 bg-amber-950/50 text-amber-200"
            title={`${itemRewards} item reward${itemRewards > 1 ? "s" : ""}`}
          >
            ⌹ {itemRewards}
          </Badge>
        )}
        {flagRewards > 0 && (
          <Badge
            className="border-sky-900 bg-sky-950/50 text-sky-300"
            title={`${flagRewards} flag reward${flagRewards > 1 ? "s" : ""}`}
          >
            ⚑ {flagRewards}
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
