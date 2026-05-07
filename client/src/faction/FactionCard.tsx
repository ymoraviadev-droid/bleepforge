import { Link } from "react-router";
import type { Faction, FactionData } from "@bleepforge/shared";
import { assetUrl } from "../api";
import { AssetThumb } from "../AssetThumb";
import { BannerPlaceholder, IconPlaceholder } from "../PixelPlaceholder";

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
          <IconPlaceholder
            className="size-14"
            title={`No icon for ${faction.DisplayName || faction.Faction}`}
          />
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

      {faction.Banner ? (
        <img
          src={assetUrl(faction.Banner)}
          alt=""
          title={faction.Banner}
          className="mt-1 block w-full max-h-36 rounded border border-neutral-800 bg-neutral-950 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <BannerPlaceholder
          className="mt-1 h-20 w-full"
          title={`No banner for ${faction.DisplayName || faction.Faction}`}
        />
      )}
    </Link>
  );
}
