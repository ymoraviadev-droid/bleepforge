import { useEffect, useMemo, useState } from "react";
import type { Npc, Quest } from "@bleepforge/shared";
import { npcsApi, questsApi } from "../../lib/api";
import { ButtonLink } from "../../components/Button";
import { EmptyState, NoticeboardEmpty } from "../../components/EmptyState";
import { useSyncRefresh } from "../../lib/sync/useSyncRefresh";
import { textInput } from "../../styles/classes";
import { CARDS_LIST_OPTIONS, useViewMode, ViewToggle } from "../../components/ViewToggle";
import { QuestCard } from "./QuestCard";
import { QuestRow } from "./QuestRow";

import { PixelSkeleton } from "../../components/PixelSkeleton";
const NO_GIVER_KEY = "__none__";
const NO_GIVER_LABEL = "(no giver)";

type SortBy = "id" | "title" | "objectives-desc" | "rewards-desc";

const SORT_LABEL: Record<SortBy, string> = {
  id: "id",
  title: "title",
  "objectives-desc": "objectives ↓",
  "rewards-desc": "rewards ↓",
};

export function QuestList() {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [giverFilter, setGiverFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("id");
  const [view, setView] = useViewMode("quest");

  useEffect(() => {
    questsApi.list().then(setQuests).catch((e) => setError(String(e)));
    npcsApi.list().then(setNpcs).catch(() => {});
  }, []);

  useSyncRefresh({
    domain: "quest",
    onChange: () => questsApi.list().then(setQuests).catch(() => {}),
  });

  // NpcId → Npc lookup (used for portrait + display name in cards).
  const npcById = useMemo(() => {
    const m = new Map<string, Npc>();
    for (const n of npcs) {
      if (n.NpcId) m.set(n.NpcId, n);
    }
    return m;
  }, [npcs]);

  // Sorted list of givers that actually have quests, with quest counts —
  // drives the filter dropdown.
  const giverOptions = useMemo(() => {
    if (!quests) return [];
    const counts = new Map<string, number>();
    for (const q of quests) {
      const key = q.QuestGiverId || NO_GIVER_KEY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const entries = [...counts.entries()].map(([id, count]) => ({
      id,
      count,
      label:
        id === NO_GIVER_KEY
          ? NO_GIVER_LABEL
          : npcById.get(id)?.DisplayName || id,
    }));
    entries.sort((a, b) => {
      // Push "(no giver)" to the end.
      if (a.id === NO_GIVER_KEY) return 1;
      if (b.id === NO_GIVER_KEY) return -1;
      return a.label.localeCompare(b.label);
    });
    return entries;
  }, [quests, npcById]);

  const filteredAndGrouped = useMemo(() => {
    if (!quests) return null;
    const q = search.toLowerCase().trim();
    const filtered = quests.filter((quest) => {
      const giverKey = quest.QuestGiverId || NO_GIVER_KEY;
      if (giverFilter && giverFilter !== giverKey) return false;
      if (!q) return true;
      const giverName = npcById.get(quest.QuestGiverId)?.DisplayName ?? "";
      return (
        quest.Id.toLowerCase().includes(q) ||
        quest.Title.toLowerCase().includes(q) ||
        quest.Description.toLowerCase().includes(q) ||
        quest.QuestGiverId.toLowerCase().includes(q) ||
        giverName.toLowerCase().includes(q) ||
        quest.Objectives.some((o) =>
          o.Description.toLowerCase().includes(q),
        )
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "id":
          return a.Id.localeCompare(b.Id);
        case "title":
          return (a.Title || a.Id).localeCompare(b.Title || b.Id);
        case "objectives-desc":
          return (
            b.Objectives.length - a.Objectives.length ||
            a.Id.localeCompare(b.Id)
          );
        case "rewards-desc":
          return (
            b.Rewards.length - a.Rewards.length || a.Id.localeCompare(b.Id)
          );
      }
    });

    // Group by giver. The order of groups follows giverOptions (alphabetical
    // by display name, with "(no giver)" pinned last).
    const groups = new Map<string, Quest[]>();
    for (const opt of giverOptions) groups.set(opt.id, []);
    for (const quest of sorted) {
      const key = quest.QuestGiverId || NO_GIVER_KEY;
      const list = groups.get(key);
      if (list) list.push(quest);
    }
    return { groups, sorted };
  }, [quests, search, giverFilter, sortBy, npcById, giverOptions]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (quests === null || filteredAndGrouped === null)
    return <PixelSkeleton />;

  const totalShown = filteredAndGrouped.sorted.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Quests{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== quests.length ? ` / ${quests.length}` : ""})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} options={CARDS_LIST_OPTIONS} />
          <ButtonLink to="/quests/new">New</ButtonLink>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="search id, title, description, giver…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${textInput} mt-0 max-w-xs flex-1`}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          giver
          <select
            value={giverFilter}
            onChange={(e) => setGiverFilter(e.target.value)}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {giverOptions.map((opt) => (
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

      {quests.length === 0 ? (
        <EmptyState
          illustration={<NoticeboardEmpty className="size-32" />}
          title="The board is bare"
          body="No quests posted yet. Pin your first one — assign a giver, draft objectives, set rewards."
          action={{ label: "+ Create quest", href: "/quests/new" }}
        />
      ) : totalShown === 0 ? (
        <p className="text-neutral-500">No quests match the current filter.</p>
      ) : (
        <div className="space-y-6">
          {giverOptions.map((opt) => {
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
                    {list.map((quest) => (
                      <QuestCard
                        key={quest.Id}
                        quest={quest}
                        giver={npcById.get(quest.QuestGiverId)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {list.map((quest) => (
                      <QuestRow
                        key={quest.Id}
                        quest={quest}
                        giver={npcById.get(quest.QuestGiverId)}
                      />
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
