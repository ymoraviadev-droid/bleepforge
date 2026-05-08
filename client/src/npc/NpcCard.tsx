import { Link } from "react-router";
import type { Npc } from "@bleepforge/shared";
import { AssetThumb } from "../AssetThumb";
import { PortraitPlaceholder } from "../PixelPlaceholder";

interface Props {
  npc: Npc;
  className?: string;
}

const MAX_INLINE = 3;

export function NpcCard({ npc, className = "" }: Props) {
  const questIds = npc.Quests.map((q) => q.QuestId).filter(Boolean);
  const lootNames =
    npc.LootTable?.Entries.map((e) => pickupBasename(e.PickupScene)).filter(
      Boolean,
    ) ?? [];
  const remarkName = casualRemarkBasename(npc.CasualRemark);

  const hasReferences =
    npc.DefaultDialog ||
    npc.OffendedDialog ||
    npc.DeathImpactId ||
    npc.DeathImpactIdContextual ||
    questIds.length > 0 ||
    lootNames.length > 0 ||
    remarkName;

  const hasFlags = npc.OffendedFlag || npc.ContextualFlag || npc.DidSpeakFlag;

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

      {hasReferences && (
        <div className="flex flex-col gap-0.5 font-mono text-[10px] text-neutral-400">
          {npc.DefaultDialog && (
            <RefLine
              label="dialog"
              labelClass="text-emerald-400/70"
              value={npc.DefaultDialog}
            />
          )}
          {npc.OffendedDialog && (
            <RefLine
              label="offended"
              labelClass="text-red-400/70"
              value={npc.OffendedDialog}
            />
          )}
          {questIds.length > 0 && (
            <RefLine
              label="quests"
              labelClass="text-amber-400/70"
              value={summarizeList(questIds, MAX_INLINE)}
              title={questIds.join(", ")}
            />
          )}
          {lootNames.length > 0 && (
            <RefLine
              label="loot"
              labelClass="text-neutral-500"
              value={summarizeList(lootNames, MAX_INLINE)}
              title={lootNames.join(", ")}
            />
          )}
          {npc.DeathImpactId && (
            <RefLine
              label="karma"
              labelClass="text-rose-400/70"
              value={
                npc.DeathImpactIdContextual
                  ? `${npc.DeathImpactId} / ${npc.DeathImpactIdContextual}`
                  : npc.DeathImpactId
              }
              title={
                npc.DeathImpactIdContextual
                  ? `default: ${npc.DeathImpactId}\ncontextual: ${npc.DeathImpactIdContextual}${npc.ContextualFlag ? ` (when ${npc.ContextualFlag})` : ""}`
                  : npc.DeathImpactId
              }
            />
          )}
          {!npc.DeathImpactId && npc.DeathImpactIdContextual && (
            <RefLine
              label="karma+ctx"
              labelClass="text-rose-400/70"
              value={npc.DeathImpactIdContextual}
            />
          )}
          {remarkName && (
            <RefLine
              label="balloon"
              labelClass="text-sky-400/70"
              value={remarkName}
              title={npc.CasualRemark}
            />
          )}
        </div>
      )}

      {hasFlags && (
        <div className="flex flex-col gap-0.5 border-t border-neutral-800 pt-1.5 font-mono text-[9px] text-neutral-600">
          {npc.OffendedFlag && (
            <span
              className="truncate"
              title="OffendedFlag — switches NPC to OffendedDialog when set"
            >
              ⚑ OffendedFlag: {npc.OffendedFlag}
            </span>
          )}
          {npc.ContextualFlag && (
            <span
              className="truncate"
              title="ContextualFlag — when set, DeathImpactIdContextual fires instead of DeathImpactId"
            >
              ⚑ ContextualFlag: {npc.ContextualFlag}
            </span>
          )}
          {npc.DidSpeakFlag && (
            <span
              className="truncate"
              title="DidSpeakFlag — set the first time the player speaks to this NPC"
            >
              ⚑ DidSpeakFlag: {npc.DidSpeakFlag}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function RefLine({
  label,
  labelClass,
  value,
  title,
}: {
  label: string;
  labelClass: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex gap-1.5 truncate" title={title}>
      <span className={`${labelClass} shrink-0`}>{label}:</span>
      <span className="truncate text-neutral-300">{value}</span>
    </div>
  );
}

function summarizeList(items: string[], max: number): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")}, +${items.length - max}`;
}

// res://world/collectibles/medkit/medkit.tscn → "medkit"
function pickupBasename(path: string): string {
  if (!path) return "";
  const last = path.split("/").pop() ?? "";
  return last.replace(/\.tscn$/i, "");
}

// res://characters/npcs/hap_500/balloons/happy_druid_greetings.tres → "happy_druid_greetings"
function casualRemarkBasename(path: string): string {
  if (!path) return "";
  const last = path.split("/").pop() ?? "";
  return last.replace(/\.tres$/i, "");
}
