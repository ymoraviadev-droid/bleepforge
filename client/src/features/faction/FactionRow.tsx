import { Link } from "react-router";
import type { Faction, FactionData } from "@bleepforge/shared";
import { AssetThumb } from "../../components/AssetThumb";
import { IconPlaceholder } from "../../components/PixelPlaceholder";

interface Props {
  faction: FactionData;
  className?: string;
}

const FACTION_ACCENT: Record<Faction, string> = {
  Scavengers: "border-amber-800 bg-amber-950/30",
  FreeRobots: "border-emerald-800 bg-emerald-950/30",
  RFF: "border-red-800 bg-red-950/30",
  Grove: "border-teal-800 bg-teal-950/30",
};

export function FactionRow({ faction, className = "" }: Props) {
  return (
    <Link
      to={`/factions/${encodeURIComponent(faction.Faction)}`}
      className={`${className} ${FACTION_ACCENT[faction.Faction] ?? "border-neutral-800 bg-neutral-900"} flex items-center gap-3 rounded border px-3 py-1.5 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      {faction.Icon ? (
        <AssetThumb path={faction.Icon} size="xs" />
      ) : (
        <IconPlaceholder
          className="size-8 shrink-0 rounded border border-neutral-800 bg-neutral-950 p-0.5"
          title={`No icon for ${faction.DisplayName || faction.Faction}`}
        />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 truncate font-mono text-[11px] text-neutral-500">
          {faction.Faction}
        </span>
        <span className="shrink-0 truncate text-sm font-semibold text-neutral-100">
          {faction.DisplayName || (
            <span className="italic font-normal text-neutral-500">
              {faction.Faction}
            </span>
          )}
        </span>
        {faction.ShortDescription && (
          <span className="hidden min-w-0 flex-1 truncate text-xs text-neutral-400 sm:block">
            {faction.ShortDescription}
          </span>
        )}
      </div>
    </Link>
  );
}
