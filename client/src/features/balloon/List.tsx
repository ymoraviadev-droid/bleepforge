import { useMemo, useState } from "react";
import type { Balloon } from "@bleepforge/shared";
import { useBalloons, useNpcs } from "../../lib/stores";
import { ButtonLink } from "../../components/Button";
import { EmptyState, TerminalSilent } from "../../components/EmptyState";
import { textInput } from "../../styles/classes";
import { CARDS_LIST_OPTIONS, useViewMode, ViewToggle } from "../../components/ViewToggle";
import { BalloonCard } from "./BalloonCard";
import { BalloonRow } from "./BalloonRow";

import { PixelSkeleton } from "../../components/PixelSkeleton";
// Flat list across all model folders. Two filter dropdowns:
//   - by NPC: reverse lookup over NpcData.CasualRemarks (which NPC speaks
//     this balloon at runtime).
//   - by model: the on-disk folder ("hap_500", "sld_300"). Cheap to add
//     since we already have it; gives a fast "balloons for hap_500 robots"
//     slice when the user is iterating one robot model's voice.
// Plus the standard text search and the cards/list view toggle. No graph
// view — balloons aren't connected to each other.

type SortBy = "id" | "text" | "model";
type GroupBy = "model" | "npc" | "none";

const SORT_LABEL: Record<SortBy, string> = {
  id: "id",
  text: "text",
  model: "model",
};

const GROUP_LABEL: Record<GroupBy, string> = {
  model: "model",
  npc: "npc",
  none: "none",
};

interface FlatBalloon {
  folder: string;
  balloon: Balloon;
  ref: string; // "<folder>/<id>"
}

interface Group {
  /** Stable id for React keys. Empty string = the catch-all "Unused" group. */
  id: string;
  /** Display label shown in the section header. */
  label: string;
  items: FlatBalloon[];
}

export function BalloonList() {
  const { data: groups, error } = useBalloons();
  const { data: npcs } = useNpcs();
  const [search, setSearch] = useState("");
  const [npcFilter, setNpcFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("model");
  const [groupBy, setGroupBy] = useState<GroupBy>("model");
  const [view, setView] = useViewMode("balloon");

  const flat: FlatBalloon[] | null = useMemo(() => {
    if (!groups) return null;
    return groups.flatMap((g) =>
      g.balloons.map((b) => ({
        folder: g.folder,
        balloon: b,
        ref: `${g.folder}/${b.Id}`,
      })),
    );
  }, [groups]);

  // NPC options for the dropdown — only NPCs that actually reference at
  // least one balloon. Sorted by display name.
  const npcOptions = useMemo(() => {
    const opts: { id: string; label: string; count: number }[] = [];
    for (const n of npcs ?? []) {
      if (n.CasualRemarks.length === 0) continue;
      opts.push({
        id: n.NpcId,
        label: n.DisplayName || n.NpcId,
        count: n.CasualRemarks.length,
      });
    }
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [npcs]);

  // Model options — folders that exist, with balloon counts so the user
  // sees "hap_500 (4)" instead of an opaque list.
  const modelOptions = useMemo(() => {
    if (!groups) return [];
    return groups
      .map((g) => ({ id: g.folder, count: g.balloons.length }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [groups]);

  // Map: balloon ref → set of NPC ids that reference it. Built once per
  // npcs change so the per-balloon filter check stays cheap.
  const refToNpcIds = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of npcs ?? []) {
      for (const ref of n.CasualRemarks) {
        const set = m.get(ref) ?? new Set<string>();
        set.add(n.NpcId);
        m.set(ref, set);
      }
    }
    return m;
  }, [npcs]);

  const filteredAndSorted = useMemo(() => {
    if (!flat) return null;
    const q = search.toLowerCase().trim();
    const filtered = flat.filter((fb) => {
      if (modelFilter && fb.folder !== modelFilter) return false;
      if (npcFilter) {
        const ids = refToNpcIds.get(fb.ref);
        if (!ids || !ids.has(npcFilter)) return false;
      }
      if (!q) return true;
      return (
        fb.balloon.Id.toLowerCase().includes(q) ||
        fb.balloon.Text.toLowerCase().includes(q) ||
        fb.folder.toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "id":
          return a.balloon.Id.localeCompare(b.balloon.Id);
        case "text":
          return a.balloon.Text.localeCompare(b.balloon.Text);
        case "model":
          return (
            a.folder.localeCompare(b.folder) ||
            a.balloon.Id.localeCompare(b.balloon.Id)
          );
      }
    });
  }, [flat, search, npcFilter, modelFilter, sortBy, refToNpcIds]);

  // Quick lookup: NpcId → display label for "by NPC" group headers.
  const npcLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of npcs ?? []) m.set(n.NpcId, n.DisplayName || n.NpcId);
    return m;
  }, [npcs]);

  // Bucket the sorted list into named groups. "none" → single unlabeled
  // group, rendered without a section header. "model" → one group per
  // folder, in alphabetical order. "npc" → one group per NPC that uses
  // any balloon, plus a final "Unused" bucket; a balloon used by N NPCs
  // appears in N groups (data is small enough that duplication beats
  // hiding the relationship).
  const renderGroups = useMemo<Group[] | null>(() => {
    if (!filteredAndSorted) return null;
    if (groupBy === "none") {
      return [{ id: "all", label: "", items: filteredAndSorted }];
    }
    if (groupBy === "model") {
      const byFolder = new Map<string, FlatBalloon[]>();
      for (const fb of filteredAndSorted) {
        const list = byFolder.get(fb.folder) ?? [];
        list.push(fb);
        byFolder.set(fb.folder, list);
      }
      return [...byFolder.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([folder, items]) => ({ id: folder, label: folder, items }));
    }
    // groupBy === "npc"
    const byNpc = new Map<string, FlatBalloon[]>();
    const unused: FlatBalloon[] = [];
    for (const fb of filteredAndSorted) {
      const ids = refToNpcIds.get(fb.ref);
      if (!ids || ids.size === 0) {
        unused.push(fb);
        continue;
      }
      for (const npcId of ids) {
        const list = byNpc.get(npcId) ?? [];
        list.push(fb);
        byNpc.set(npcId, list);
      }
    }
    const out: Group[] = [...byNpc.entries()]
      .sort((a, b) =>
        (npcLabelById.get(a[0]) ?? a[0]).localeCompare(
          npcLabelById.get(b[0]) ?? b[0],
        ),
      )
      .map(([npcId, items]) => ({
        id: `npc:${npcId}`,
        label: npcLabelById.get(npcId) ?? npcId,
        items,
      }));
    if (unused.length > 0) {
      out.push({ id: "", label: "Unused", items: unused });
    }
    return out;
  }, [filteredAndSorted, groupBy, refToNpcIds, npcLabelById]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (flat === null || filteredAndSorted === null || renderGroups === null)
    return <PixelSkeleton />;

  const totalShown = filteredAndSorted.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Balloons{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({totalShown}
            {totalShown !== flat.length ? ` / ${flat.length}` : ""})
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} options={CARDS_LIST_OPTIONS} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="search id, text, model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${textInput} mt-0 max-w-xs flex-1`}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          npc
          <select
            value={npcFilter}
            onChange={(e) => setNpcFilter(e.target.value)}
            className={`${textInput} mt-0 w-auto`}
          >
            <option value="">all</option>
            {npcOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>
        </label>
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
                {opt.id} ({opt.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          group
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className={`${textInput} mt-0 w-auto`}
          >
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((k) => (
              <option key={k} value={k}>
                {GROUP_LABEL[k]}
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

      {flat.length === 0 ? (
        <EmptyState
          illustration={<TerminalSilent className="size-32" />}
          title="All quiet on the comms"
          body={
            <>
              No balloon lines yet. Create one here, or drop a{" "}
              <span className="font-mono">BalloonLine</span> .tres into{" "}
              <span className="font-mono">
                characters/npcs/&lt;model&gt;/balloons/
              </span>{" "}
              — picks up on next save.
            </>
          }
          action={{ label: "+ Create balloon", href: "/balloons/new" }}
        />
      ) : totalShown === 0 ? (
        <p className="text-neutral-500">No balloons match the current filter.</p>
      ) : (
        <div className="space-y-6">
          {renderGroups.map((g) => {
            // For grouped views, every section gets a header with name +
            // count. For groupBy=none we render the single group bare so
            // it looks identical to the pre-grouping flat layout.
            // Stable React keys: prefix with view+groupBy because the same
            // FlatBalloon can appear in multiple "by NPC" groups.
            const renderItem = (fb: FlatBalloon) =>
              view === "cards" ? (
                <BalloonCard
                  key={`${g.id}:${fb.ref}`}
                  balloon={fb.balloon}
                  folder={fb.folder}
                  npcs={npcs ?? []}
                />
              ) : (
                <BalloonRow
                  key={`${g.id}:${fb.ref}`}
                  balloon={fb.balloon}
                  folder={fb.folder}
                  npcs={npcs ?? []}
                />
              );

            const grid =
              view === "cards" ? (
                <div className="grid grid-cols-1 gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.items.map(renderItem)}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {g.items.map(renderItem)}
                </div>
              );

            return (
              <section key={g.id || "ungrouped"}>
                {g.label && (
                  <h2 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {g.label}
                    <span className="text-[10px] text-neutral-600">
                      ({g.items.length})
                    </span>
                  </h2>
                )}
                {grid}
              </section>
            );
          })}
        </div>
      )}

      {/* New-balloon affordance. Routes to /balloons/new which the Edit page
          handles — same pattern as other domains. Dropped below the list so
          it doesn't compete with the filter chrome. */}
      <div className="pt-2">
        <ButtonLink to="/balloons/new" variant="secondary">
          + New balloon
        </ButtonLink>
      </div>
    </div>
  );
}
