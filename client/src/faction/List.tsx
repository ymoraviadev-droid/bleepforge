import { useEffect, useState } from "react";
import type { FactionData } from "@bleepforge/shared";
import { factionsApi } from "../api";
import { ButtonLink } from "../Button";
import { useSyncRefresh } from "../sync/useSyncRefresh";
import { FactionCard } from "./FactionCard";

// Stable display order — matches the C# Faction enum declaration so the cards
// always read in the canonical order regardless of import order.
const ORDER: FactionData["Faction"][] = ["Scavengers", "FreeRobots", "RFF", "Grove"];

export function FactionList() {
  const [factions, setFactions] = useState<FactionData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <ButtonLink to="/factions/new">New</ButtonLink>
      </div>

      {factions.length === 0 ? (
        <p className="text-neutral-500">
          No factions yet. Run <span className="font-mono">Preferences → Import from Godot</span>{" "}
          to import the four <span className="font-mono">FactionData</span> files from the project.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {sorted.map((f) => (
            <FactionCard key={f.Faction} faction={f} />
          ))}
        </div>
      )}
    </div>
  );
}
