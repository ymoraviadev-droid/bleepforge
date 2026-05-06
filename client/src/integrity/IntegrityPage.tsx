import { Link } from "react-router";
import { refreshCatalog } from "../catalog-bus";
import { useCatalog, type Catalog } from "../useCatalog";
import { button } from "../ui";

interface Issue {
  domain: "Dialog" | "Quest" | "Item";
  severity: "error" | "warning";
  description: string;
  link?: string;
}

function computeIssues(catalog: Catalog): Issue[] {
  const issues: Issue[] = [];
  const npcIds = new Set(catalog.npcs.map((n) => n.NpcId));
  const itemSlugs = new Set(catalog.items.map((i) => i.Slug));
  const questIds = new Set(catalog.quests.map((q) => q.Id));
  const sequenceIds = new Set(catalog.sequences.map((s) => s.Id));

  // ---- Quests ----
  for (const q of catalog.quests) {
    if (q.QuestGiverId && !npcIds.has(q.QuestGiverId)) {
      issues.push({
        domain: "Quest",
        severity: "error",
        description: `Quest "${q.Id}" QuestGiverId="${q.QuestGiverId}" — no NPC with that id`,
        link: `/quests/${encodeURIComponent(q.Id)}`,
      });
    }
    for (const obj of q.Objectives) {
      if (obj.Type === "CollectItem" && obj.TargetItem && !itemSlugs.has(obj.TargetItem)) {
        issues.push({
          domain: "Quest",
          severity: "error",
          description: `Quest "${q.Id}" objective "${obj.Id || "(unnamed)"}" TargetItem="${obj.TargetItem}" — no item with that slug`,
          link: `/quests/${encodeURIComponent(q.Id)}`,
        });
      }
      if (
        (obj.Type === "TalkToNpc" || obj.Type === "KillNpc") &&
        obj.TargetId &&
        !npcIds.has(obj.TargetId)
      ) {
        issues.push({
          domain: "Quest",
          severity: "error",
          description: `Quest "${q.Id}" objective "${obj.Id || "(unnamed)"}" TargetId="${obj.TargetId}" — no NPC with that id`,
          link: `/quests/${encodeURIComponent(q.Id)}`,
        });
      }
    }
    q.Rewards.forEach((r, ri) => {
      if (r.Type === "Item" && r.Item && !itemSlugs.has(r.Item)) {
        issues.push({
          domain: "Quest",
          severity: "error",
          description: `Quest "${q.Id}" reward #${ri + 1} Item="${r.Item}" — no item with that slug`,
          link: `/quests/${encodeURIComponent(q.Id)}`,
        });
      }
    });
    // Duplicate Objective IDs within a quest
    const seen = new Map<string, number>();
    for (const obj of q.Objectives) {
      if (!obj.Id) continue;
      seen.set(obj.Id, (seen.get(obj.Id) ?? 0) + 1);
    }
    for (const [id, count] of seen) {
      if (count > 1) {
        issues.push({
          domain: "Quest",
          severity: "error",
          description: `Quest "${q.Id}" has ${count} objectives with Id="${id}"`,
          link: `/quests/${encodeURIComponent(q.Id)}`,
        });
      }
    }
  }

  // ---- Items ----
  for (const it of catalog.items) {
    if (it.Category === "QuestItem" && it.QuestId && !questIds.has(it.QuestId)) {
      issues.push({
        domain: "Item",
        severity: "error",
        description: `Item "${it.Slug}" QuestId="${it.QuestId}" — no quest with that id`,
        link: `/items/${encodeURIComponent(it.Slug)}`,
      });
    }
  }

  // ---- Dialogs: dangling NextSequenceIds ----
  for (const group of catalog.dialogs) {
    for (const seq of group.sequences) {
      seq.Lines.forEach((line, lineIdx) => {
        line.Choices.forEach((c, ci) => {
          if (c.NextSequenceId && !sequenceIds.has(c.NextSequenceId)) {
            issues.push({
              domain: "Dialog",
              severity: "error",
              description: `${group.folder} / ${seq.Id} (line ${lineIdx + 1}, choice ${ci + 1}) NextSequenceId="${c.NextSequenceId}" — sequence not found`,
              link: `/dialogs/${encodeURIComponent(group.folder)}/${encodeURIComponent(seq.Id)}`,
            });
          }
        });
      });
    }
  }

  // ---- Dialogs: duplicate sequence Ids across folders ----
  const seqLocations = new Map<string, string[]>();
  for (const group of catalog.dialogs) {
    for (const seq of group.sequences) {
      const list = seqLocations.get(seq.Id) ?? [];
      list.push(group.folder);
      seqLocations.set(seq.Id, list);
    }
  }
  for (const [id, folders] of seqLocations) {
    if (folders.length > 1) {
      issues.push({
        domain: "Dialog",
        severity: "error",
        description: `Sequence Id "${id}" appears in multiple folders: ${folders.join(", ")}`,
        link: `/dialogs/${encodeURIComponent(folders[0]!)}/${encodeURIComponent(id)}`,
      });
    }
  }

  return issues;
}

export function IntegrityPage() {
  const catalog = useCatalog();
  if (catalog === null)
    return <div className="text-neutral-500">Loading catalog…</div>;

  const issues = computeIssues(catalog);
  const byDomain = groupBy(issues, (i) => i.domain);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Integrity</h1>
          <p className="text-xs text-neutral-500">
            {issues.length === 0
              ? "All clear — no broken references found."
              : `${issues.length} issue${issues.length === 1 ? "" : "s"} found.`}
          </p>
        </div>
        <button
          onClick={refreshCatalog}
          className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
        >
          Refresh
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="rounded border-2 border-emerald-800/60 bg-emerald-950/20 p-8 text-center text-emerald-300">
          ✓ No broken references, no duplicate sequence ids, no dangling FKs.
        </div>
      ) : (
        Object.entries(byDomain).map(([domain, list]) => (
          <section key={domain}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-300">
              {domain} ({list.length})
            </h2>
            <ul className="divide-y divide-neutral-800 border-2 border-neutral-800">
              {list.map((iss, idx) => (
                <li key={idx} className="px-3 py-2 text-sm hover:bg-neutral-900">
                  {iss.link ? (
                    <Link to={iss.link} className="block">
                      <span
                        className={
                          iss.severity === "error"
                            ? "mr-2 text-red-400"
                            : "mr-2 text-amber-400"
                        }
                      >
                        ●
                      </span>
                      <span className="text-neutral-200">{iss.description}</span>
                    </Link>
                  ) : (
                    <span className="text-neutral-200">{iss.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of arr) {
    const k = key(x);
    if (!out[k]) out[k] = [];
    out[k].push(x);
  }
  return out;
}
