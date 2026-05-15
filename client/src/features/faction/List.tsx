import type { FactionData } from "@bleepforge/shared";
import { useFactions } from "../../lib/stores";
import { ButtonLink } from "../../components/Button";
import { EmptyState, WorkshopEmpty } from "../../components/EmptyState";
import { CARDS_LIST_OPTIONS, useViewMode, ViewToggle } from "../../components/ViewToggle";
import { FactionCard } from "./FactionCard";
import { FactionRow } from "./FactionRow";

import { PixelSkeleton } from "../../components/PixelSkeleton";
// Stable display order — matches the C# Faction enum declaration so the cards
// always read in the canonical order regardless of import order.
const ORDER: FactionData["Faction"][] = ["Scavengers", "FreeRobots", "RFF", "Grove"];

export function FactionList() {
  const { data: factions, error } = useFactions();
  const [view, setView] = useViewMode("faction");

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (factions === null) return <PixelSkeleton />;

  const sorted = [...factions].sort(
    (a, b) => ORDER.indexOf(a.Faction) - ORDER.indexOf(b.Faction),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Factions{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({factions.length})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} options={CARDS_LIST_OPTIONS} />
          <ButtonLink to="/factions/new">New</ButtonLink>
        </div>
      </div>

      {factions.length === 0 ? (
        <EmptyState
          illustration={<WorkshopEmpty className="size-32" />}
          title="No factions registered"
          body={
            <>
              Bleepforge picks up <span className="font-mono">FactionData</span>{" "}
              .tres files from{" "}
              <span className="font-mono">
                shared/components/factions/&lt;name&gt;/
              </span>
              . If your project has them, restart the server to import.
            </>
          }
          action={{ label: "+ Create faction", href: "/factions/new" }}
        />
      ) : (
        view === "cards" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            {sorted.map((f) => (
              <FactionCard key={f.Faction} faction={f} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorted.map((f) => (
              <FactionRow key={f.Faction} faction={f} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
