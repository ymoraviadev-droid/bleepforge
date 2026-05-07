import { Link } from "react-router";
import type { Npc, Quest } from "@bleepforge/shared";
import { AssetThumb } from "../AssetThumb";

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

export function QuestCard({ quest, giver, className = "" }: Props) {
  // Objective counts by type — only shown when non-zero.
  const objCounts: Record<string, number> = {};
  for (const o of quest.Objectives) {
    objCounts[o.Type] = (objCounts[o.Type] ?? 0) + 1;
  }

  // Rewards: aggregate counts/sums per kind.
  let itemRewards = 0;
  let creditRewards = 0;
  let flagRewards = 0;
  for (const r of quest.Rewards) {
    if (r.Type === "Item") itemRewards += Math.max(1, r.Quantity);
    else if (r.Type === "Credits") creditRewards += r.CreditAmount;
    else if (r.Type === "Flag") flagRewards += 1;
  }

  const giverPortrait = giver?.Portrait ?? "";
  const giverName = giver?.DisplayName || quest.QuestGiverId;

  return (
    <Link
      to={`/quests/${encodeURIComponent(quest.Id)}`}
      className={`${className} flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      <div className="flex items-start gap-3">
        {giverPortrait ? (
          <AssetThumb path={giverPortrait} size="sm" />
        ) : (
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded border border-dashed border-neutral-800 text-[10px] text-neutral-600"
            title={
              quest.QuestGiverId
                ? `No portrait for ${quest.QuestGiverId}`
                : "No quest giver"
            }
          >
            {quest.QuestGiverId ? "?" : "—"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-neutral-100">
            {quest.Title || (
              <span className="italic font-normal text-neutral-500">
                untitled
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-neutral-500">
            {quest.Id}
          </div>
          {giverName && (
            <div className="mt-0.5 truncate text-[10px] text-neutral-400">
              <span className="text-neutral-600">giver:</span> {giverName}
            </div>
          )}
        </div>
      </div>

      {quest.Description && (
        <p className="line-clamp-3 text-xs text-neutral-400">
          {quest.Description}
        </p>
      )}

      {(quest.Objectives.length > 0 || quest.Rewards.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
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
      )}

      {(quest.ActiveFlag || quest.CompleteFlag || quest.TurnedInFlag) && (
        <div className="flex flex-wrap gap-1 border-t border-neutral-800 pt-1.5 font-mono text-[9px] text-neutral-600">
          {quest.ActiveFlag && (
            <span className="truncate" title="ActiveFlag (set on StartQuest)">
              ⚑ {quest.ActiveFlag}
            </span>
          )}
          {quest.CompleteFlag && (
            <span
              className="truncate"
              title="CompleteFlag (set when objectives complete)"
            >
              ⚑ {quest.CompleteFlag}
            </span>
          )}
          {quest.TurnedInFlag && (
            <span className="truncate" title="TurnedInFlag (set on TurnIn)">
              ⚑ {quest.TurnedInFlag}
            </span>
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
