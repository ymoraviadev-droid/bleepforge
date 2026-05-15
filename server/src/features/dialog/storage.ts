import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DialogSequenceSchema, type DialogSequence } from "@bleepforge/shared";
import { folderAbs } from "../../config.js";

const root = (): string => folderAbs.dialog;

const LAYOUT_FILE = "_layout.json";

const PointSchema = z.object({ x: z.number(), y: z.number() });

const EdgeStyleSchema = z.object({
  shape: z.enum(["curved", "straight"]).default("curved"),
  dashed: z.boolean().default(false),
  waypoints: z.array(PointSchema).default([]),
});

export const LayoutSchema = z.object({
  nodes: z.record(z.string(), PointSchema).default({}),
  edges: z.record(z.string(), EdgeStyleSchema).default({}),
});
export type Layout = z.infer<typeof LayoutSchema>;

// Old shape was Record<string, {x,y}>. Migrate it to the new {nodes, edges} form.
function normalizeLayout(raw: unknown): Layout {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("nodes" in obj || "edges" in obj) {
      return LayoutSchema.parse(obj);
    }
  }
  return LayoutSchema.parse({ nodes: raw ?? {}, edges: {} });
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
function sanitize(name: string, kind: "folder" | "id"): string {
  if (!NAME_RE.test(name)) {
    throw Object.assign(new Error(`invalid ${kind} name: ${name}`), { status: 400 });
  }
  return name;
}

export async function listFolders(): Promise<string[]> {
  try {
    const entries = await fs.readdir(root(), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function listInFolder(folder: string): Promise<DialogSequence[]> {
  sanitize(folder, "folder");
  const dir = path.join(root(), folder);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: DialogSequence[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name === LAYOUT_FILE) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      out.push(DialogSequenceSchema.parse(JSON.parse(raw)));
    } catch (err) {
      console.warn(`[dialogs/${folder}] skipping ${name}: ${(err as Error).message}`);
    }
  }
  return out;
}

const EMPTY_LAYOUT: Layout = { nodes: {}, edges: {} };

export async function readLayout(folder: string): Promise<Layout> {
  sanitize(folder, "folder");
  try {
    const raw = await fs.readFile(path.join(root(), folder, LAYOUT_FILE), "utf8");
    return normalizeLayout(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_LAYOUT };
    return { ...EMPTY_LAYOUT };
  }
}

export async function writeLayout(folder: string, layout: unknown): Promise<Layout> {
  sanitize(folder, "folder");
  const validated = normalizeLayout(layout);
  const dir = path.join(root(), folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, LAYOUT_FILE),
    JSON.stringify(validated, null, 2),
    "utf8",
  );
  return validated;
}

export async function listAll(): Promise<{ folder: string; sequences: DialogSequence[] }[]> {
  const folders = await listFolders();
  return Promise.all(
    folders.map(async (folder) => ({ folder, sequences: await listInFolder(folder) })),
  );
}

export async function read(folder: string, id: string): Promise<DialogSequence | null> {
  sanitize(folder, "folder");
  sanitize(id, "id");
  try {
    const raw = await fs.readFile(path.join(root(), folder, `${id}.json`), "utf8");
    return DialogSequenceSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function write(folder: string, seq: DialogSequence): Promise<DialogSequence> {
  sanitize(folder, "folder");
  sanitize(seq.Id, "id");
  const validated = DialogSequenceSchema.parse(seq);
  const dir = path.join(root(), folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${validated.Id}.json`),
    JSON.stringify(validated, null, 2),
    "utf8",
  );
  return validated;
}

export async function remove(folder: string, id: string): Promise<boolean> {
  sanitize(folder, "folder");
  sanitize(id, "id");
  try {
    await fs.unlink(path.join(root(), folder, `${id}.json`));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
