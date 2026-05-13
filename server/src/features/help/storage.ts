import fs from "node:fs/promises";
import path from "node:path";
import {
  HelpCategoryMetaSchema,
  HelpEntrySchema,
  RESERVED_HELP_ENTRY_IDS,
  type HelpCategoryGroup,
  type HelpCategoryMeta,
  type HelpEntry,
} from "@bleepforge/shared";
import { folderAbs } from "../../config.js";

// Folder-aware read-only storage for the in-app Help feature. Each
// category is a directory holding a _meta.json schema file plus one .json
// per entry. Help content is authored directly in these JSON files (and
// seeded from the asar's bundled seed/help/ on first launch); there is
// no writeback API.
//
// Reserved names: `_meta` (schema file) and `_layout` (reserved for
// future per-category UI state) are filtered out of entry listings.

const root = folderAbs.help;

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const META_FILENAME = "_meta.json";

function sanitize(name: string, kind: "category" | "id"): string {
  if (!NAME_RE.test(name)) {
    throw Object.assign(new Error(`invalid ${kind} name: ${name}`), { status: 400 });
  }
  if (kind === "id" && RESERVED_HELP_ENTRY_IDS.has(name)) {
    throw Object.assign(new Error(`reserved entry id: ${name}`), { status: 400 });
  }
  return name;
}

export async function listCategories(): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function readMeta(category: string): Promise<HelpCategoryMeta | null> {
  sanitize(category, "category");
  try {
    const raw = await fs.readFile(path.join(root, category, META_FILENAME), "utf8");
    return HelpCategoryMetaSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function listInCategory(category: string): Promise<HelpEntry[]> {
  sanitize(category, "category");
  const dir = path.join(root, category);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: HelpEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    if (name === META_FILENAME) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      out.push(HelpEntrySchema.parse(JSON.parse(raw)));
    } catch (err) {
      console.warn(`[help/${category}] skipping ${name}: ${(err as Error).message}`);
    }
  }
  return out;
}

export async function listAll(): Promise<HelpCategoryGroup[]> {
  const categories = await listCategories();
  const out: HelpCategoryGroup[] = [];
  for (const category of categories) {
    const meta = await readMeta(category);
    if (!meta) {
      console.warn(`[help/${category}] missing ${META_FILENAME}, skipping`);
      continue;
    }
    out.push({
      category,
      meta,
      entries: await listInCategory(category),
    });
  }
  return out;
}

export async function readEntry(category: string, id: string): Promise<HelpEntry | null> {
  sanitize(category, "category");
  sanitize(id, "id");
  try {
    const raw = await fs.readFile(path.join(root, category, `${id}.json`), "utf8");
    return HelpEntrySchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
