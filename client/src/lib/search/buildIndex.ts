import Fuse, { type IFuseOptions } from "fuse.js";
import type { Catalog } from "../useCatalog";

export type SearchKind =
  | "npc"
  | "item"
  | "quest"
  | "karma"
  | "faction"
  | "dialog"
  | "balloon"
  | "codex"
  | "shader"
  | "page";

export interface SearchItem {
  kind: SearchKind;
  /** Unique key per item — used as React key + dedupe. */
  key: string;
  /** Primary display + main searchable string. */
  label: string;
  /** Secondary line (e.g. id when label is a display name). Searchable. */
  sublabel?: string;
  /** Side-context (e.g. dialog folder, balloon model). Searchable, lower weight. */
  context?: string;
  href: string;
}

// threshold: 0 turns Fuse's Bitap fuzzy matching off — only contiguous
// substring matches count. Single-author corpus: predictability beats typo
// tolerance, since the user knows their own ids. Position/length-based
// ranking still works (matches near string start + shorter haystacks score
// better), so "edd" still ranks Eddie above an Eddie-flag karma impact.
const FUSE_OPTIONS: IFuseOptions<SearchItem> = {
  keys: [
    { name: "label", weight: 0.6 },
    { name: "sublabel", weight: 0.3 },
    { name: "context", weight: 0.1 },
  ],
  threshold: 0,
  ignoreLocation: true,
  minMatchCharLength: 1,
  includeScore: true,
};

const STATIC_PAGES: SearchItem[] = [
  { kind: "page", key: "page:concept", label: "Game concept", href: "/concept" },
  { kind: "page", key: "page:shaders", label: "Shaders", href: "/shaders" },
  { kind: "page", key: "page:assets", label: "Assets", href: "/assets" },
  { kind: "page", key: "page:diagnostics", label: "Diagnostics", href: "/diagnostics" },
  { kind: "page", key: "page:preferences", label: "Preferences", href: "/preferences" },
  { kind: "page", key: "page:help", label: "Help", href: "/help" },
];

export function buildSearchItems(catalog: Catalog): SearchItem[] {
  const items: SearchItem[] = [];

  for (const npc of catalog.npcs) {
    const display = npc.DisplayName?.trim();
    items.push({
      kind: "npc",
      key: `npc:${npc.NpcId}`,
      label: display || npc.NpcId,
      sublabel: display ? npc.NpcId : undefined,
      context: npc.MemoryEntryId || undefined,
      href: `/npcs/${npc.NpcId}`,
    });
  }

  for (const it of catalog.items) {
    const display = it.DisplayName?.trim();
    items.push({
      kind: "item",
      key: `item:${it.Slug}`,
      label: display || it.Slug,
      sublabel: display ? it.Slug : undefined,
      context: it.Category,
      href: `/items/${it.Slug}`,
    });
  }

  for (const q of catalog.quests) {
    const title = q.Title?.trim();
    items.push({
      kind: "quest",
      key: `quest:${q.Id}`,
      label: title || q.Id,
      sublabel: title ? q.Id : undefined,
      context: q.QuestGiverId || undefined,
      href: `/quests/${q.Id}`,
    });
  }

  for (const k of catalog.karma) {
    items.push({
      kind: "karma",
      key: `karma:${k.Id}`,
      label: k.Id,
      href: `/karma/${k.Id}`,
    });
  }

  for (const f of catalog.factions) {
    const display = f.DisplayName?.trim();
    items.push({
      kind: "faction",
      key: `faction:${f.Faction}`,
      label: display || f.Faction,
      sublabel: display ? f.Faction : undefined,
      href: `/factions/${f.Faction}`,
    });
  }

  for (const seq of catalog.sequences) {
    const folder = catalog.dialogs.find((g) => g.sequences.includes(seq))?.folder ?? "";
    items.push({
      kind: "dialog",
      key: `dialog:${folder}/${seq.Id}`,
      label: seq.Id,
      context: folder || undefined,
      href: folder ? `/dialogs/${folder}/${seq.Id}` : `/dialogs`,
    });
  }

  // Balloons are the principled exception — index by Text (no id property).
  // The id (filename basename) is a sublabel for clarity in the row.
  for (const ref of catalog.balloonRefs) {
    const text = ref.balloon.Text?.trim();
    items.push({
      kind: "balloon",
      key: `balloon:${ref.id}`,
      label: text || ref.balloon.Id,
      sublabel: text ? ref.balloon.Id : undefined,
      context: ref.folder,
      href: `/balloons/${ref.folder}/${ref.balloon.Id}`,
    });
  }

  // Codex entries — flat across categories. Display name beats id when set;
  // the category's own DisplayName is the side context so the user sees
  // "Lava pool · Hazards" in the row, not the raw folder slug.
  for (const e of catalog.codexEntries) {
    const display = e.entry.DisplayName?.trim();
    items.push({
      kind: "codex",
      key: `codex:${e.category}/${e.entry.Id}`,
      label: display || e.entry.Id,
      sublabel: display ? e.entry.Id : undefined,
      context: e.meta.DisplayName || e.category,
      href: `/codex/${e.category}/${e.entry.Id}`,
    });
  }

  // Shaders — indexed by basename (no extension) so "scanlines" finds
  // scanlines.gdshader without forcing the user to type the suffix. The
  // parentRel is the side context (e.g. "shared/shaders") so the
  // dropdown row reads "scanlines · shared/shaders".
  for (const sh of catalog.shaders) {
    const stem = sh.basename.replace(/\.gdshader$/, "");
    items.push({
      kind: "shader",
      key: `shader:${sh.path}`,
      label: stem,
      sublabel: sh.basename,
      context: sh.parentRel || undefined,
      href: `/shaders/edit?path=${encodeURIComponent(sh.path)}`,
    });
  }

  // Help entries deliberately NOT indexed here. The in-page Help search
  // (features/help/HelpSearch.tsx) covers all Help content including
  // body text. Keeping them out of the global Ctrl+K palette stops
  // help-prose from drowning the canonical entity search.
  items.push(...STATIC_PAGES);

  return items;
}

export function buildSearchFuse(items: SearchItem[]): Fuse<SearchItem> {
  return new Fuse(items, FUSE_OPTIONS);
}
