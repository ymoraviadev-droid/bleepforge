import type { Catalog } from "../useCatalog";
import { validateCodexEntryFlat } from "../../features/codex/propertyValidator";

export interface Issue {
  domain: "Dialog" | "Quest" | "Item" | "Npc" | "Codex";
  severity: "error" | "warning";
  description: string;
  link?: string;
}

// Pure cross-domain integrity check. Lives in its own module so the
// IntegrityTab page renderer AND the unified health-status hook
// (used by the App-level header indicator) can share the same logic
// without dragging in any UI imports.
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

  // ---- NPCs: dangling LootEntry.PickupScene refs ----
  // The collectible scene the LootEntry points at must exist on disk in
  // `world/collectibles/`. If the .tscn was renamed or removed in Godot,
  // the JSON ref goes stale and the loot would silently misbehave at
  // runtime. We catch it here before save so the user can fix it.
  const pickupPaths = new Set(catalog.pickups.map((p) => p.path));
  for (const npc of catalog.npcs) {
    if (!npc.LootTable) continue;
    npc.LootTable.Entries.forEach((entry, ei) => {
      if (!entry.PickupScene) return;
      if (pickupPaths.has(entry.PickupScene)) return;
      issues.push({
        domain: "Npc",
        severity: "error",
        description: `NPC "${npc.NpcId}" loot entry #${ei + 1} PickupScene="${entry.PickupScene}" — no collectible scene at that path`,
        link: `/npcs/${encodeURIComponent(npc.NpcId)}`,
      });
    });
  }

  // ---- NPCs: dangling CasualRemarks refs ----
  // Each entry in the array must resolve to a balloon that actually exists.
  // If a balloon .tres is renamed or removed in Godot, the CasualRemarks
  // entry goes stale and Godot would either fail to load or pick a
  // null/missing balloon at runtime.
  const balloonIds = new Set(catalog.balloonRefs.map((b) => b.id));
  for (const npc of catalog.npcs) {
    npc.CasualRemarks.forEach((ref, ri) => {
      if (!ref) return;
      if (balloonIds.has(ref)) return;
      issues.push({
        domain: "Npc",
        severity: "error",
        description: `NPC "${npc.NpcId}" CasualRemarks #${ri + 1} = "${ref}" — no balloon with that id`,
        link: `/npcs/${encodeURIComponent(npc.NpcId)}`,
      });
    });
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

  // ---- Codex entries: schema validation + dangling FK refs ----
  // Each entry is checked against its category's _meta.json. Required
  // fields, type-vs-value mismatches, and FK refs to nonexistent
  // entities all surface here. Dangling refs are the most common case
  // — a referenced NPC gets renamed in Godot and the Codex entry's ref
  // goes stale.
  for (const e of catalog.codexEntries) {
    const flatErrors = validateCodexEntryFlat(e.meta, e.entry, catalog);
    for (const message of flatErrors) {
      issues.push({
        domain: "Codex",
        severity: "error",
        description: `${e.meta.DisplayName || e.category} / ${e.entry.Id}: ${message}`,
        link: `/codex/${encodeURIComponent(e.category)}/${encodeURIComponent(e.entry.Id)}`,
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
