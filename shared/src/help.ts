import { z } from "zod";

// In-app Help. Bleepforge-only authoring surface for user-facing
// documentation: a small Wikipedia-shaped library of categories, each
// holding a list of entries with optional Section grouping labels.
//
// On disk:
//   data/help/<categoryId>/_meta.json   category metadata + display + color
//   data/help/<categoryId>/<entryId>.json  one file per entry
//
// Section is a free-form string property on each entry, not a folder. The
// list view groups entries by Section within their category; entries with
// an empty Section land in a default group at the top.
//
// Authoring is gated by the BLEEPFORGE_DEV_MODE env var on the server.
// When the flag is unset, GET endpoints serve content normally but PUT
// and DELETE return 403 and the client hides edit affordances.

const KEY_RE = /^[a-zA-Z0-9_-]+$/;

// Same eight-color palette Codex uses, lifted intact so the AppSearch
// kind-badge color story stays coherent and the global theme retints
// every surface from the same set.
export const HELP_COLORS = [
  "emerald",
  "amber",
  "red",
  "blue",
  "violet",
  "cyan",
  "orange",
  "pink",
  "lime",
] as const;
export type HelpColor = (typeof HELP_COLORS)[number];

export const HelpCategoryMetaSchema = z.object({
  Category: z.string().regex(KEY_RE),
  DisplayName: z.string().default(""),
  Color: z.enum(HELP_COLORS).default("emerald"),
  // Short description shown under the category header on the list page.
  // Optional. Single line; for longer prose, write an intro entry.
  Description: z.string().default(""),
  // Sort key for the list page. Lower numbers first. Ties broken by
  // Category id alphabetically.
  Order: z.number().int().default(0),
  CreatedAt: z.string().default(""),
});
export type HelpCategoryMeta = z.infer<typeof HelpCategoryMetaSchema>;

export const HelpEntrySchema = z.object({
  Id: z.string().regex(KEY_RE),
  Title: z.string().default(""),
  // Optional in-category grouping label. Entries with the same Section
  // string render under one subheading on the category page. Empty
  // section means "no section, list at top." Free-form; the only
  // ordering between sections is alphabetical, so name them with a
  // leading number ("01 First steps") when that order matters.
  Section: z.string().default(""),
  // One or two lines, used as the row sublabel on the category page and
  // as the AppSearch sublabel.
  Summary: z.string().default(""),
  // Long-form body. Plain string with a markdown subset rendered by
  // [client/src/features/help/render.tsx]. Supported: ## h2, ### h3,
  // paragraphs, - bullets, `inline code`, ```code blocks```,
  // > note: callouts (also tip:, warn:), [label](/route) links, and
  // :kbd[Ctrl+K] keyboard chips.
  Body: z.string().default(""),
  // Sort key within a section. Lower numbers first.
  Order: z.number().int().default(0),
  // Free tags. Not surfaced in the UI yet; reserved for future filtering.
  Tags: z.array(z.string()).default([]),
  // Stamped on every successful PUT.
  UpdatedAt: z.string().default(""),
});
export type HelpEntry = z.infer<typeof HelpEntrySchema>;

// Reserved entry ids. _meta is the schema file, _layout is reserved for
// future per-category UI state if we ever need it. Without these guards
// the entry route /:category/:id would happily overwrite either.
export const RESERVED_HELP_ENTRY_IDS = new Set<string>(["_meta", "_layout"]);

// Group shape returned by GET /api/help. Mirrors CodexCategoryGroup.
export interface HelpCategoryGroup {
  category: string;
  meta: HelpCategoryMeta;
  entries: HelpEntry[];
}

// Helper: deterministic comparator for the list page. Categories sort
// by Order asc, then by Category id alphabetically. Ties on Order between
// "1" and "1" fall through to the id sort, which is stable.
export function compareCategories(
  a: { meta: HelpCategoryMeta; category: string },
  b: { meta: HelpCategoryMeta; category: string },
): number {
  if (a.meta.Order !== b.meta.Order) return a.meta.Order - b.meta.Order;
  return a.category.localeCompare(b.category);
}

// Helper: comparator for entries within a category. Sorts by Section
// (empty Section first, since "no group" reads as "introductory" in
// practice), then by Order asc, then by Title.
export function compareEntries(a: HelpEntry, b: HelpEntry): number {
  if (a.Section !== b.Section) {
    if (!a.Section) return -1;
    if (!b.Section) return 1;
    return a.Section.localeCompare(b.Section);
  }
  if (a.Order !== b.Order) return a.Order - b.Order;
  const at = a.Title || a.Id;
  const bt = b.Title || b.Id;
  return at.localeCompare(bt);
}

// Group entries by Section for the category page. Returns the sections
// in display order; entries within each are presorted by compareEntries.
export interface HelpEntrySection {
  section: string;
  entries: HelpEntry[];
}

export function groupEntriesBySection(entries: HelpEntry[]): HelpEntrySection[] {
  const sorted = [...entries].sort(compareEntries);
  const out: HelpEntrySection[] = [];
  let current: HelpEntrySection | null = null;
  for (const entry of sorted) {
    if (!current || current.section !== entry.Section) {
      current = { section: entry.Section, entries: [] };
      out.push(current);
    }
    current.entries.push(entry);
  }
  return out;
}
