import { Link } from "react-router";
import type { Faction, FactionData } from "@bleepforge/shared";
import { AssetThumb } from "../AssetThumb";

interface Props {
  faction: FactionData;
  className?: string;
}

// Each faction lives at a fixed Tailwind accent for visual identity. These
// are intentionally NOT theme-aware (the accent re-points emerald per theme,
// but factions are about *their* identity not the user's theme choice).
const FACTION_ACCENT: Record<Faction, string> = {
  Scavengers: "border-amber-800 bg-amber-950/30",
  FreeRobots: "border-emerald-800 bg-emerald-950/30",
  RFF: "border-red-800 bg-red-950/30",
  Grove: "border-teal-800 bg-teal-950/30",
};

export function FactionCard({ faction, className = "" }: Props) {
  return (
    <Link
      to={`/factions/${encodeURIComponent(faction.Faction)}`}
      className={`${className} ${FACTION_ACCENT[faction.Faction] ?? "border-neutral-800 bg-neutral-900"} flex flex-col gap-2 rounded border p-3 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      <div className="flex items-start gap-3">
        {faction.Icon ? (
          <AssetThumb path={faction.Icon} size="md" />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-[10px] text-neutral-500">
            no icon
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-neutral-100">
            {faction.DisplayName || (
              <span className="italic font-normal text-neutral-500">
                {faction.Faction}
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-neutral-500">
            {faction.Faction}
          </div>
        </div>
      </div>

      {faction.ShortDescription && (
        <p className="line-clamp-3 text-xs text-neutral-400">
          {faction.ShortDescription}
        </p>
      )}

      {faction.Banner && (
        <div className="border-t border-neutral-800 pt-2">
          <AssetThumb
            path={faction.Banner}
            size="lg"
            className="!size-auto !w-full max-h-32 object-cover"
          />
        </div>
      )}
    </Link>
  );
}
