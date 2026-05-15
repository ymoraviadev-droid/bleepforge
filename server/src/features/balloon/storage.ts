import fs from "node:fs/promises";
import path from "node:path";
import { BalloonSchema, type Balloon } from "@bleepforge/shared";
import { folderAbs } from "../../config.js";

// Folder-aware storage for the Balloons domain. Mirrors dialog/storage.ts:
// per-folder layout on disk where <folder> is the NPC robot model (e.g.
// "hap_500"), matching Godot's `characters/npcs/<model>/balloons/<id>.tres`.
//
// Why per-folder: BalloonLine has no Id property in the C# resource, so the
// only stable identity is the .tres filename basename. Different model
// folders could theoretically ship a balloon with the same basename
// ("greeting.tres" each). Per-folder JSON keys those collisions out at the
// storage layer instead of pretending they can't happen.

// Resolve root() on every call so the storage tracks config.dataRoot
// changes from hot-reload (v0.2.5+). Capturing into a `const` at module
// load would stale-bind to the project that was active at server boot.
const root = (): string => folderAbs.balloon;

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

export async function listInFolder(folder: string): Promise<Balloon[]> {
  sanitize(folder, "folder");
  const dir = path.join(root(), folder);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Balloon[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      out.push(BalloonSchema.parse(JSON.parse(raw)));
    } catch (err) {
      console.warn(`[balloons/${folder}] skipping ${name}: ${(err as Error).message}`);
    }
  }
  return out;
}

export interface BalloonFolderGroup {
  folder: string;
  balloons: Balloon[];
}

export async function listAll(): Promise<BalloonFolderGroup[]> {
  const folders = await listFolders();
  return Promise.all(
    folders.map(async (folder) => ({ folder, balloons: await listInFolder(folder) })),
  );
}

export async function read(folder: string, id: string): Promise<Balloon | null> {
  sanitize(folder, "folder");
  sanitize(id, "id");
  try {
    const raw = await fs.readFile(path.join(root(), folder, `${id}.json`), "utf8");
    return BalloonSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function write(folder: string, balloon: Balloon): Promise<Balloon> {
  sanitize(folder, "folder");
  sanitize(balloon.Id, "id");
  const validated = BalloonSchema.parse(balloon);
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
