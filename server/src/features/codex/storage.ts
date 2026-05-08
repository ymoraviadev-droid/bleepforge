import fs from "node:fs/promises";
import path from "node:path";
import {
  CodexCategoryMetaSchema,
  CodexEntrySchema,
  RESERVED_ENTRY_IDS,
  validateEntryAgainstMeta,
  type CodexCategoryGroup,
  type CodexCategoryMeta,
  type CodexEntry,
} from "@bleepforge/shared";
import { folderAbs } from "../../config.js";

// Folder-aware storage for the Game Codex domain. Mirrors balloon/storage.ts
// (per-folder JSON files keyed by basename) but with two key differences:
//
// 1. Each category carries a `_meta.json` schema file alongside its entries.
//    Entries' Properties bag is validated against this schema on write.
// 2. Bleepforge-only — no .tres round-trip, no afterWrite hook, no saves
//    feed integration.
//
// Reserved name: `_meta` cannot be used as an entry id (it'd clobber the
// schema file). Storage rejects it; the client just doesn't surface it.

const root = folderAbs.codex;

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const META_FILENAME = "_meta.json";

function sanitize(name: string, kind: "category" | "id"): string {
  if (!NAME_RE.test(name)) {
    throw Object.assign(new Error(`invalid ${kind} name: ${name}`), { status: 400 });
  }
  if (kind === "id" && RESERVED_ENTRY_IDS.has(name)) {
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

export async function readMeta(category: string): Promise<CodexCategoryMeta | null> {
  sanitize(category, "category");
  try {
    const raw = await fs.readFile(path.join(root, category, META_FILENAME), "utf8");
    return CodexCategoryMetaSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeMeta(meta: CodexCategoryMeta): Promise<CodexCategoryMeta> {
  sanitize(meta.Category, "category");
  const validated = CodexCategoryMetaSchema.parse({
    ...meta,
    // Stamp CreatedAt on first write only — preserve existing if already set.
    CreatedAt: meta.CreatedAt || new Date().toISOString(),
  });
  const dir = path.join(root, validated.Category);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, META_FILENAME),
    JSON.stringify(validated, null, 2),
    "utf8",
  );
  return validated;
}

export async function listInCategory(category: string): Promise<CodexEntry[]> {
  sanitize(category, "category");
  const dir = path.join(root, category);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: CodexEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    if (name === META_FILENAME) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      out.push(CodexEntrySchema.parse(JSON.parse(raw)));
    } catch (err) {
      console.warn(`[codex/${category}] skipping ${name}: ${(err as Error).message}`);
    }
  }
  return out;
}

export async function listAll(): Promise<CodexCategoryGroup[]> {
  const categories = await listCategories();
  const out: CodexCategoryGroup[] = [];
  for (const category of categories) {
    const meta = await readMeta(category);
    if (!meta) {
      // Folder exists but no _meta.json — treat as a malformed category and
      // skip rather than fabricating a meta on the fly. Surfaces as missing
      // in the UI; user can repair by editing the category.
      console.warn(`[codex/${category}] missing ${META_FILENAME}, skipping`);
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

export async function readEntry(category: string, id: string): Promise<CodexEntry | null> {
  sanitize(category, "category");
  sanitize(id, "id");
  try {
    const raw = await fs.readFile(path.join(root, category, `${id}.json`), "utf8");
    return CodexEntrySchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeEntry(category: string, entry: CodexEntry): Promise<CodexEntry> {
  sanitize(category, "category");
  sanitize(entry.Id, "id");
  const meta = await readMeta(category);
  if (!meta) {
    throw Object.assign(new Error(`category "${category}" has no _meta.json`), {
      status: 400,
    });
  }
  const validated = CodexEntrySchema.parse(entry);
  // Cross-check property values against the category's schema. Type
  // mismatches and missing required fields fail the write — better to
  // refuse than to land malformed data on disk.
  const schemaErrors = validateEntryAgainstMeta(meta, validated);
  if (schemaErrors.length > 0) {
    throw Object.assign(
      new Error(`property validation failed: ${schemaErrors.join("; ")}`),
      { status: 400 },
    );
  }
  const dir = path.join(root, category);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${validated.Id}.json`),
    JSON.stringify(validated, null, 2),
    "utf8",
  );
  return validated;
}

export async function removeEntry(category: string, id: string): Promise<boolean> {
  sanitize(category, "category");
  sanitize(id, "id");
  try {
    await fs.unlink(path.join(root, category, `${id}.json`));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

// Wipe an entire category: every entry JSON, the _meta.json, and the
// directory itself. Caller is responsible for confirming with the user.
export async function removeCategory(category: string): Promise<boolean> {
  sanitize(category, "category");
  const dir = path.join(root, category);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
