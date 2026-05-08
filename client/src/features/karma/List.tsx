import { useEffect, useMemo, useState } from "react";
import type { Faction, FactionData, KarmaImpact } from "@bleepforge/shared";
import { factionsApi, karmaApi } from "../../lib/api";
import { ButtonLink } from "../../components/Button";
import { useSyncRefresh } from "../../lib/sync/useSyncRefresh";
import { textInput } from "../../styles/classes";
import { CARDS_LIST_OPTIONS, useViewMode, ViewToggle } from "../../components/ViewToggle";
import { KarmaCard } from "./KarmaCard";
import { KarmaRow } from "./KarmaRow";

type SortBy = "id" | "magnitude-desc" | "deltas-desc";

const SORT_LABEL: Record<SortBy, string> = {
  id: "id",
  "magnitude-desc": "magnitude ↓",
  "deltas-desc": "deltas ↓",
};

function magnitudeOf(k: KarmaImpact): number {
  return k.Deltas.reduce((acc, d) => acc + Math.abs(d.Amount), 0);
}

export function KarmaList() {
  const [impacts, setImpacts] = useState<KarmaImpact[] | null>(null);
  const [factions, setFactions] = useState<FactionData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [factionFilter, setFactionFilter] = useState<Faction | "">("");
  const [sortBy, setSortBy] = useState<SortBy>("id");
  const [view, setView] = useViewMode("karma");

  useEffect(() => {
    karmaApi.list().then(setImpacts).catch((e) => setError(String(e)));
    factionsApi.list().then(setFactions).catch(() => {});
  }, []);

  useSyncRefresh({
    domain: "karma",
    onChange: () => karmaApi.list().then(setImpacts).catch(() => {}),
  });
  useSyncRefresh({
    domain: "faction",
    onChange: () => factionsApi.list().then(setFactions).catch(() => {}),
  });

  // Faction enum → FactionData map for icon lookup in cards.
  const factionsByEnum = useMemo(() => {
    const m = new Map<Faction, FactionData>();
    for (const f of factions) m.set(f.Faction, f);
    return m;
  }, [factions]);

  // Faction options for the filter dropdown — only factions actually
  // referenced by some impact. Sorted by display name (alphabetical).
  const factionOptions = useMemo(() => {
    if (!impacts) return [];
    const counts = new Map<Faction, number>();
    for (const k of impacts) {
      for (const d of k.Deltas) {
        counts.set(d.Faction, (counts.get(d.Faction) ?? 0) + 1);
      }
    }
    const entries = [...counts.entries()].map(([id, count]) => ({
      id,
      count,
      label: factionsByEnum.get(id)?.DisplayName || id,
    }));
    entries.sort((a, b) => a.label.localeCompare(b.label));
    return entries;
  }, [impacts, factionsByEnum]);

  const filteredAndSorted = useMemo(() => {
    if (!impacts) return null;
    const q = search.toLowerCase().trim();
    const filtered = impacts.filter((k) => {
      if (factionFilter) {
        const has = k.Deltas.some((d) => d.Faction === factionFilter);
        if (!has) return false;
      }
      if (!q) return true;
      return (
        k.Id.toLowerCase().includes(q) ||
        k.Description.toLowerCase().includes(q) ||
        k.Deltas.some((d) =>
          (factionsByEnum.get(d.Faction)?.DisplayName || d.Faction)
            .toLowerCase()
            .includes(q),
        )
      );
    });
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "id":
          return a.Id.localeCompare(b.Id);
        case "magnitude-desc":
          return magnitudeOf(b) - magnitudeOf(a) || a.Id.localeCompare(b.Id);
        case "deltas-desc":
          return (
            b.Deltas.length - a.Deltas.length || a.Id.localeCompare(b.Id)
          );
      }
    });
  }, [impacts, search, factionFilter, sortBy, factionsByEnum]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (impacts === null || filteredAndSorted === null)
    return <div className="text-neutral-500">Loading…</div>;

  const totalShown = filteredAndSorted.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Karma impacts{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== impacts.length ? ` / ${impacts.length}` : ""})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} options={CARDS_LIST_OPTIONS} />
          <ButtonLink to="/karma/new">New</ButtonLink>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="search id, description, faction…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${textInput} mt-0 max-w-xs flex-1`}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          faction
          <select
            value={factionFilter}
            onChange={(e) => setFactionFilter(e.target.value as Faction | "")}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {factionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={`${textInput} mt-0 w-auto`}
          >
            {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {impacts.length === 0 ? (
        <p className="text-neutral-500">No karma impacts yet.</p>
      ) : totalShown === 0 ? (
        <p className="text-neutral-500">
          No karma impacts match the current filter.
        </p>
      ) : (
        view === "cards" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAndSorted.map((k) => (
              <KarmaCard
                key={k.Id}
                impact={k}
                factionsByEnum={factionsByEnum}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredAndSorted.map((k) => (
              <KarmaRow
                key={k.Id}
                impact={k}
                factionsByEnum={factionsByEnum}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
