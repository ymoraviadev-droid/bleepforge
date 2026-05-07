import type { Catalog } from "../useCatalog";

export interface Issue {
  domain: "Dialog" | "Quest" | "Item";
  severity: "error" | "warning";
  description: string;
  link?: string;
}

// Pure cross-domain integrity check. Extracted from IntegrityPage so the App
// nav can run it too (to render a checkmark vs. red tint on the Integrity link).
export function computeIssues(catalog: Catalog): Issue[] {
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
