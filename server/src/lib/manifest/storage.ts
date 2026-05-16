// JSON cache storage for manifest-discovered domains.
//
// Mirrors the FoB-domain storage shape: one JSON file per entity, under
// `<dataRoot>/<manifest-domain>/...`. Kind-aware path resolution:
//   - `domain`         → `<dataRoot>/<domain>/<id>.json`
//   - `foldered`       → `<dataRoot>/<domain>/<folder>/<basename>.json`
//     (id is the composite "<folder>/<basename>" projectIndex emits)
//   - `enumKeyed`      → `<dataRoot>/<domain>/<enum-value>.json`
//   - `discriminatedFamily` → NOT supported in v0.2.8 (the generic
//     orchestrator refuses these too). Phase 3 just declines to write
//     anything for that kind — caller surfaces a warning.
//
// FoB-domain names (`item` / `quest` / ...) are NEVER accepted here —
// they have their own routers. The boot reconcile guard skips manifest
// entries whose name collides with the hardcoded set, mirroring the
// v0.2.7 fix that gave FoB priority in projectIndex classification.
//
// No zod schema: manifest-domain entity shapes are runtime-defined by
// the manifest, not codegen'd. Validation happens at the orchestrator
// (handler dispatch enforces per-field shape) plus a structural
// "is object, has keys" guard at write time.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Entry } from "@bleepforge/shared";
import { config } from "../../config.js";

const FOB_DOMAINS = new Set([
  "item",
  "quest",
  "karma",
  "faction",
  "npc",
  "dialog",
  "balloon",
]);

export function isFobDomainName(domain: string): boolean {
  return FOB_DOMAINS.has(domain);
}

/** Absolute path to a manifest domain's JSON cache root. */
export function manifestDomainFolder(domain: string): string {
  return path.join(config.dataRoot, domain);
}

/** Absolute path to a single entity's JSON file. Splits foldered ids
 *  on `/` to land at the nested location. Returns null for unsupported
 *  entry kinds (discriminatedFamily today). */
export function resolveEntityPath(entry: Entry, id: string): string | null {
  const root = manifestDomainFolder(entry.domain);
  if (entry.kind === "domain" || entry.kind === "enumKeyed") {
    return path.join(root, `${id}.json`);
  }
  if (entry.kind === "foldered") {
    const slash = id.indexOf("/");
    if (slash <= 0) return null; // malformed composite id
    const folder = id.substring(0, slash);
    const basename = id.substring(slash + 1);
    return path.join(root, folder, `${basename}.json`);
  }
  return null;
}

/** Atomic write of one entity's JSON. Creates parent dirs on demand
 *  (per-folder for foldered domains). Throws on resolveEntityPath
 *  failure so the boot reconcile records an error rather than silently
 *  dropping the entity.
 *
 *  Also ensures a `.gitignore` marker at the domain root containing
 *  `*` — the canonical way to say "ignore everything in this dir,
 *  including this file itself." Without it, every manifest-domain
 *  cache (note/, snippet/, element/, …) would surface in `git status`
 *  since user-defined domain names can't be enumerated in the repo's
 *  .gitignore. Idempotent: write once on the first reconcile per
 *  domain, no-op thereafter. */
export async function writeEntity(
  entry: Entry,
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const target = resolveEntityPath(entry, id);
  if (!target) {
    throw new Error(
      `manifest-domain "${entry.domain}" (kind=${entry.kind}): cannot resolve path for id "${id}"`,
    );
  }
  await mkdir(path.dirname(target), { recursive: true });
  await ensureDomainGitignore(entry.domain);
  const tmp = `${target}.tmp`;
  const body = JSON.stringify(values, null, 2) + "\n";
  await writeFile(tmp, body, "utf8");
  await rename(tmp, target);
}

async function ensureDomainGitignore(domain: string): Promise<void> {
  const root = manifestDomainFolder(domain);
  const ignorePath = path.join(root, ".gitignore");
  try {
    // readdir is cheap; readFile would also work but we don't need the
    // contents — just whether the marker exists.
    const names = await readdir(root);
    if (names.includes(".gitignore")) return;
  } catch {
    // Domain root doesn't exist yet — mkdir above will create it before
    // the entity file lands. Fall through to write the marker.
  }
  await mkdir(root, { recursive: true });
  await writeFile(ignorePath, "*\n", "utf8");
}

/** Read every entity in a manifest domain's JSON cache. The on-disk
 *  walk depth depends on the entry kind — flat (domain / enumKeyed)
 *  reads `<root>/*.json`, foldered reads `<root>/*<folder>/<basename>.json`.
 *  Missing root dir → empty list (the domain was discovered but never
 *  reconciled yet, or has zero entries). */
export async function listEntities(
  entry: Entry,
): Promise<{ id: string; values: Record<string, unknown> }[]> {
  const root = manifestDomainFolder(entry.domain);
  const out: { id: string; values: Record<string, unknown> }[] = [];

  if (entry.kind === "domain" || entry.kind === "enumKeyed") {
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      return out;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.substring(0, name.length - 5);
      const file = path.join(root, name);
      try {
        const body = await readFile(file, "utf8");
        out.push({ id, values: JSON.parse(body) as Record<string, unknown> });
      } catch {
        // Corrupted entries are surfaced separately via the reconcile
        // status; the list endpoint stays best-effort.
        continue;
      }
    }
    return out;
  }

  if (entry.kind === "foldered") {
    let folders: string[];
    try {
      folders = await readdir(root);
    } catch {
      return out;
    }
    for (const folder of folders) {
      const folderPath = path.join(root, folder);
      let names: string[];
      try {
        names = await readdir(folderPath);
      } catch {
        continue;
      }
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const basename = name.substring(0, name.length - 5);
        const file = path.join(folderPath, name);
        try {
          const body = await readFile(file, "utf8");
          out.push({
            id: `${folder}/${basename}`,
            values: JSON.parse(body) as Record<string, unknown>,
          });
        } catch {
          continue;
        }
      }
    }
    return out;
  }

  return out; // discriminatedFamily — unsupported in v0.2.8
}
