import { Link } from "react-router";
import type { Faction, FactionData, KarmaImpact } from "@bleepforge/shared";
import { AssetThumb } from "../AssetThumb";
import { IconPlaceholder } from "../PixelPlaceholder";

interface Props {
  impact: KarmaImpact;
  factionsByEnum: Map<Faction, FactionData>;
  className?: string;
}

export function KarmaRow({ impact, factionsByEnum, className = "" }: Props) {
  const magnitude = impact.Deltas.reduce(
    (acc, d) => acc + Math.abs(d.Amount),
    0,
  );

  return (
    <Link
      to={`/karma/${encodeURIComponent(impact.Id)}`}
      className={`${className} flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 truncate font-mono text-[12px] text-neutral-100">
          {impact.Id}
        </span>
        {impact.Description && (
          <span className="hidden min-w-0 flex-1 truncate text-xs italic text-neutral-400 sm:block">
            {impact.Description}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {impact.Deltas.map((d, idx) => {
          const faction = factionsByEnum.get(d.Faction);
          const positive = d.Amount > 0;
          const negative = d.Amount < 0;
          const factionLabel = faction?.DisplayName || d.Faction;
          return (
            <span
              key={d._subId ?? idx}
              className="flex shrink-0 items-center gap-1"
              title={`${factionLabel}: ${positive ? "+" : ""}${d.Amount}`}
            >
              {faction?.Icon ? (
                <AssetThumb path={faction.Icon} size="xs" />
              ) : (
                <IconPlaceholder
                  className="size-8 shrink-0 rounded border border-neutral-800 bg-neutral-950 p-0.5"
                  title={`${d.Faction} (no icon)`}
                />
              )}
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                  positive
                    ? "border-emerald-800 bg-emerald-950/50 text-emerald-200"
                    : negative
                      ? "border-red-800 bg-red-950/50 text-red-200"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400"
                }`}
              >
                {positive ? "+" : ""}
                {d.Amount}
              </span>
            </span>
          );
        })}
        {magnitude > 0 && (
          <span
            className="ml-1 shrink-0 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-neutral-400"
            title="Total absolute magnitude"
          >
            ±{magnitude}
          </span>
        )}
      </div>
    </Link>
  );
}
