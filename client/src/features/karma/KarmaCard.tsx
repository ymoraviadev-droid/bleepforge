import { Link } from "react-router";
import type { Faction, FactionData, KarmaImpact } from "@bleepforge/shared";
import { AssetThumb } from "../../components/AssetThumb";
import { IconPlaceholder } from "../../components/PixelPlaceholder";

interface Props {
  impact: KarmaImpact;
  factionsByEnum: Map<Faction, FactionData>;
  className?: string;
}

export function KarmaCard({ impact, factionsByEnum, className = "" }: Props) {
  // Total magnitude — sum of absolute delta amounts. Used as a quick
  // "how impactful is this?" badge in the header.
  const magnitude = impact.Deltas.reduce(
    (acc, d) => acc + Math.abs(d.Amount),
    0,
  );

  return (
    <Link
      to={`/karma/${encodeURIComponent(impact.Id)}`}
      className={`${className} flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 transition-colors hover:border-emerald-700 hover:bg-neutral-800/40`}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[12px] text-neutral-100">
            {impact.Id}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
            {impact.Deltas.length}{" "}
            {impact.Deltas.length === 1 ? "delta" : "deltas"}
          </div>
        </div>
        {magnitude > 0 && (
          <span
            className="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-neutral-300"
            title="Total absolute magnitude"
          >
            ±{magnitude}
          </span>
        )}
      </header>

      {impact.Description && (
        <p className="line-clamp-2 text-xs italic text-neutral-300">
          {impact.Description}
        </p>
      )}

      {impact.Deltas.length > 0 && (
        <ul className="space-y-1 border-t border-neutral-800 pt-2">
          {impact.Deltas.map((d, idx) => {
            const faction = factionsByEnum.get(d.Faction);
            const positive = d.Amount > 0;
            const negative = d.Amount < 0;
            return (
              <li
                key={d._subId ?? idx}
                className="flex items-center gap-2 text-xs"
              >
                {faction?.Icon ? (
                  <AssetThumb path={faction.Icon} size="xs" />
                ) : (
                  <IconPlaceholder
                    className="size-8"
                    title={`${d.Faction} (no icon)`}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-neutral-200">
                  {faction?.DisplayName || d.Faction}
                </span>
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
              </li>
            );
          })}
        </ul>
      )}
    </Link>
  );
}
