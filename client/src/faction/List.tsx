import { useEffect, useState } from "react";
import type { FactionData } from "@bleepforge/shared";
import { factionsApi } from "../lib/api";
import { ButtonLink } from "../components/Button";
import { useSyncRefresh } from "../sync/useSyncRefresh";
import { CARDS_LIST_OPTIONS, useViewMode, ViewToggle } from "../components/ViewToggle";
import { FactionCard } from "./FactionCard";
import { FactionRow } from "./FactionRow";

// Stable display order — matches the C# Faction enum declaration so the cards
// always read in the canonical order regardless of import order.
const ORDER: FactionData["Faction"][] = ["Scavengers", "FreeRobots", "RFF", "Grove"];

export function FactionList() {
  const [factions, setFactions] = useState<FactionData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useViewMode("faction");

  useEffect(() => {
    factionsApi.list().then(setFactions).catch((e) => setError(String(e)));
  }, []);

  useSyncRefresh({
    domain: "faction",
    onChange: () => factionsApi.list().then(setFactions).catch(() => {}),
  });

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (factions === null) return <div className="text-neutral-500">Loading…</div>;

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
        <p className="text-neutral-500">
          No factions yet. Run <span className="font-mono">Preferences → Import from Godot</span>{" "}
          to import the four <span className="font-mono">FactionData</span> files from the project.
        </p>
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
