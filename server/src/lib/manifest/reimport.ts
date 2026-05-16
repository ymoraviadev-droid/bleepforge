// Per-file re-import for manifest-discovered domains. Mirrors the
// FoB-side `internal/tres/reimportOne.ts` for non-FoB domains the
// generic importer handles.
//
// The watcher calls this when it sees a .tres change for a manifest-
// classified file. We parse, run readFromManifest with a freshly-built
// ReaderContext, and write the JSON cache entry via storage.writeEntity.
//
// Symmetric with manifestReconcile's per-entry loop — the only
// difference is the boot reconcile drives it from projectIndex.list()
// while this one is driven by a single file event. Both use the same
// reader path so produce the same JSON.

import { readFile, unlink } from "node:fs/promises";

import type { Entry, SubResource } from "@bleepforge/shared";

import { readFromManifest } from "../../internal/import/generic/orchestrator.js";
import type { ReaderContext } from "../../internal/import/generic/types.js";
import { resPathToAbs } from "../../internal/import/mappers.js";
import { parseTres } from "../../internal/import/tresParser.js";
import { projectIndex } from "../projectIndex/index.js";
import { manifestCache } from "./cache.js";
import { resolveEntityPath, writeEntity } from "./storage.js";

export interface ManifestReimportResult {
  ok: boolean;
  domain?: string;
  key?: string;
  jsonPath?: string;
  warnings?: string[];
  error?: string;
}

export async function reimportOneManifest(
  absPath: string,
  godotRoot: string,
): Promise<ManifestReimportResult> {
  const indexed = projectIndex.getByAbsPath(absPath);
  if (!indexed) {
    return { ok: false, error: "no projectIndex entry for path" };
  }
  if (!("id" in indexed)) {
    return { ok: false, error: "indexed entry is a pickup, not a .tres" };
  }
  const entry = manifestCache.getDomain(indexed.domain);
  if (!entry) {
    return {
      ok: false,
      error: `domain "${indexed.domain}" not declared in active manifest`,
    };
  }
  if (entry.kind === "discriminatedFamily") {
    return {
      ok: false,
      error: `kind "discriminatedFamily" not yet supported by generic importer`,
    };
  }

  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch (err) {
    return { ok: false, error: `read failed: ${(err as Error).message}` };
  }

  const parsed = parseTres(text);
  const subResources = new Map<string, SubResource>();
  for (const sub of manifestCache.listSubResources()) {
    subResources.set(sub.subResource, sub);
  }
  const ctx: ReaderContext = {
    godotRoot,
    filePath: absPath,
    parsed,
    warnings: [],
    resolveRefByExtResource: (ext, targetDomain) => {
      const target = projectIndex.getByResPath(ext.path);
      if (!target) return null;
      if (!("id" in target)) return null;
      if (target.domain !== targetDomain) return null;
      return target.id;
    },
    resPathToAbs: (p) => resPathToAbs(p, godotRoot),
    subResources,
  };

  const { entity, warnings } = readFromManifest(parsed, entry, ctx);
  if (!entity) {
    return {
      ok: false,
      domain: indexed.domain,
      key: indexed.id,
      error: warnings[0] ?? "generic importer returned null entity",
      warnings,
    };
  }

  try {
    await writeEntity(entry, indexed.id, entity);
  } catch (err) {
    return {
      ok: false,
      domain: indexed.domain,
      key: indexed.id,
      error: (err as Error).message,
      warnings,
    };
  }
  return {
    ok: true,
    domain: indexed.domain,
    key: indexed.id,
    jsonPath: resolveEntityPath(entry, indexed.id) ?? undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// Mirror of FoB's deleteJsonFor: a watcher unlink event for a manifest
// .tres removes the JSON cache file. The caller must NOT remove the
// projectIndex entry before calling this — we read its `domain` + `id`
// to recover the right path.
export async function deleteJsonForManifest(
  absPath: string,
): Promise<ManifestReimportResult> {
  const indexed = projectIndex.getByAbsPath(absPath);
  if (!indexed) {
    return { ok: false, error: "no projectIndex entry for path" };
  }
  if (!("id" in indexed)) {
    return { ok: false, error: "indexed entry is a pickup, not a .tres" };
  }
  const entry = manifestCache.getDomain(indexed.domain);
  if (!entry) {
    return {
      ok: false,
      error: `domain "${indexed.domain}" not declared in active manifest`,
    };
  }
  const jsonPath = resolveEntityPath(entry, indexed.id);
  if (!jsonPath) {
    return {
      ok: false,
      domain: indexed.domain,
      key: indexed.id,
      error: `cannot resolve JSON path for kind=${entry.kind}`,
    };
  }
  try {
    await unlink(jsonPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        ok: false,
        domain: indexed.domain,
        key: indexed.id,
        error: (err as Error).message,
      };
    }
  }
  return {
    ok: true,
    domain: indexed.domain,
    key: indexed.id,
    jsonPath,
  };
}
