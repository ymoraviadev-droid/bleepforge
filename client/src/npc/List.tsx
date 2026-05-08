import { useEffect, useMemo, useState } from "react";
import type { Npc } from "@bleepforge/shared";
import { npcsApi } from "../api";
import { ButtonLink } from "../Button";
import { useSyncRefresh } from "../sync/useSyncRefresh";
import { textInput } from "../ui";
import { useViewMode, ViewToggle } from "../ViewToggle";
import { NpcCard } from "./NpcCard";
import { NpcRow } from "./NpcRow";

const NO_MODEL_KEY = "__none__";
const NO_MODEL_LABEL = "(no model)";

type SortBy = "id" | "name" | "quests-desc";

const SORT_LABEL: Record<SortBy, string> = {
  id: "id",
  name: "name",
  "quests-desc": "quests ↓",
};

export function NpcList() {
  const [npcs, setNpcs] = useState<Npc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("id");
  const [view, setView] = useViewMode("npc");

  useEffect(() => {
    npcsApi.list().then(setNpcs).catch((e) => setError(String(e)));
  }, []);

  useSyncRefresh({
    domain: "npc",
    onChange: () => npcsApi.list().then(setNpcs).catch(() => {}),
  });

  const modelOptions = useMemo(() => {
    if (!npcs) return [];
    const counts = new Map<string, number>();
    for (const n of npcs) {
      const key = n.MemoryEntryId || NO_MODEL_KEY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const entries = [...counts.entries()].map(([id, count]) => ({
      id,
      count,
      label: id === NO_MODEL_KEY ? NO_MODEL_LABEL : id,
    }));
    entries.sort((a, b) => {
      if (a.id === NO_MODEL_KEY) return 1;
      if (b.id === NO_MODEL_KEY) return -1;
      return a.label.localeCompare(b.label);
    });
    return entries;
  }, [npcs]);

  const filteredAndGrouped = useMemo(() => {
    if (!npcs) return null;
    const q = search.toLowerCase().trim();
    const filtered = npcs.filter((n) => {
      const modelKey = n.MemoryEntryId || NO_MODEL_KEY;
      if (modelFilter && modelFilter !== modelKey) return false;
      if (!q) return true;
      return (
        n.NpcId.toLowerCase().includes(q) ||
        n.DisplayName.toLowerCase().includes(q) ||
        n.MemoryEntryId.toLowerCase().includes(q) ||
        n.DefaultDialog.toLowerCase().includes(q) ||
        n.Quests.some(
          (qe) =>
            qe.QuestId.toLowerCase().includes(q) ||
            qe.OfferDialog.toLowerCase().includes(q),
        )
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "id":
          return a.NpcId.localeCompare(b.NpcId);
        case "name":
          return (a.DisplayName || a.NpcId).localeCompare(
            b.DisplayName || b.NpcId,
          );
        case "quests-desc":
          return (
            b.Quests.length - a.Quests.length || a.NpcId.localeCompare(b.NpcId)
          );
      }
    });

    const groups = new Map<string, Npc[]>();
    for (const opt of modelOptions) groups.set(opt.id, []);
    for (const n of sorted) {
      const key = n.MemoryEntryId || NO_MODEL_KEY;
      const list = groups.get(key);
      if (list) list.push(n);
    }
    return { groups, sorted };
  }, [npcs, search, modelFilter, sortBy, modelOptions]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (npcs === null || filteredAndGrouped === null)
    return <div className="text-neutral-500">Loading…</div>;

  const totalShown = filteredAndGrouped.sorted.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          NPCs{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== npcs.length ? ` / ${npcs.length}` : ""})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} />
          <ButtonLink to="/npcs/new">New</ButtonLink>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="search id, name, model, dialog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${textInput} mt-0 max-w-xs flex-1`}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          model
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {modelOptions.map((opt) => (
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

      {npcs.length === 0 ? (
        <p className="text-neutral-500">
          No NPCs yet. Run{" "}
          <span className="font-mono">Preferences → Import from Godot</span> to
          import the <span className="font-mono">NpcData</span> .tres files.
        </p>
      ) : totalShown === 0 ? (
        <p className="text-neutral-500">No NPCs match the current filter.</p>
      ) : (
        <div className="space-y-6">
          {modelOptions.map((opt) => {
            const list = filteredAndGrouped.groups.get(opt.id) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={opt.id}>
                <h2 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {opt.label}
                  <span className="text-[10px] text-neutral-600">
                    ({list.length})
                  </span>
                </h2>
                {view === "cards" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {list.map((n) => (
                      <NpcCard key={n.NpcId} npc={n} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {list.map((n) => (
                      <NpcRow key={n.NpcId} npc={n} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
