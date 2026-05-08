import { Link } from "react-router";
import type { Balloon, Npc } from "@bleepforge/shared";

// Compact single-row representation of a Balloon. Same data as BalloonCard
// but on one line: model • text • type/hold • used-by. Density-optimized
// for scanning many balloons at once.

interface BalloonRowProps {
  balloon: Balloon;
  folder: string;
  npcs: Npc[];
}

export function BalloonRow({ balloon, folder, npcs }: BalloonRowProps) {
  const ref = `${folder}/${balloon.Id}`;
  const usedBy = npcs.filter((n) => n.CasualRemarks.includes(ref));

  return (
    <Link
      to={`/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(balloon.Id)}`}
      className="group flex items-center gap-3 border-2 border-neutral-800 bg-neutral-950 px-3 py-2 transition-colors hover:border-emerald-700 hover:bg-neutral-900"
    >
      <span className="w-20 shrink-0 truncate font-mono text-[10px] uppercase tracking-wider text-emerald-400">
        {folder}
      </span>
      <span className="w-32 shrink-0 truncate font-mono text-xs text-neutral-400">
        {balloon.Id}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-neutral-100">
        {balloon.Text || (
          <span className="italic text-neutral-600">(empty)</span>
        )}
      </span>
      <span
        className="hidden w-24 shrink-0 truncate font-mono text-[10px] uppercase tracking-wider text-neutral-500 lg:block"
        title="characters per second / hold seconds"
      >
        {fmtNum(balloon.TypeSpeed)} · {fmtNum(balloon.HoldDuration)}s
      </span>
      <span
        className="hidden w-32 shrink-0 truncate font-mono text-[10px] uppercase tracking-wider text-neutral-500 sm:block"
        title={usedBy.map((n) => n.DisplayName || n.NpcId).join(", ")}
      >
        {usedBy.length === 0 ? (
          <span className="italic text-neutral-600">unused</span>
        ) : (
          <>
            <span className="text-neutral-300">
              {usedBy.slice(0, 2).map((n) => n.DisplayName || n.NpcId).join(", ")}
            </span>
            {usedBy.length > 2 ? ` +${usedBy.length - 2}` : ""}
          </>
        )}
      </span>
    </Link>
  );
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n);
}
