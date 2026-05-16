// Boot-time reconcile pass for manifest-discovered domains.
//
// Runs after the seven FoB importer passes complete. For every domain
// the manifest declares (skipping any name that collides with FoB's
// hardcoded set), walks projectIndex.list(domain) and reads each .tres
// through the generic importer, writing JSON to
// `<dataRoot>/<domain>/...` per the kind-aware storage layout.
//
// Mirrors v0.2.7's writer-side dispatch shape: bespoke FoB readers
// (registered as overrides) run their own passes; the generic reader
// handles everything else. Per the (A) lock, the FoB pass retires by
// v0.2.9 close and even FoB-shaped projects flow through this pass.
//
// Output: per-domain { imported, skipped, errors } counts plus the
// usual file-level details. Aggregated into the existing
// ReconcileStatus + Diagnostics surfaces.

import fs from "node:fs/promises";

import type { SubResource } from "@bleepforge/shared";
import type { ReaderContext } from "../../internal/import/generic/types.js";
import { readFromManifest } from "../../internal/import/generic/orchestrator.js";
import { resPathToAbs } from "../../internal/import/mappers.js";
import { parseTres } from "../../internal/import/tresParser.js";
import { manifestCache } from "../manifest/cache.js";
import { isFobDomainName, writeEntity } from "../manifest/storage.js";
import { projectIndex } from "../projectIndex/index.js";

export interface ManifestDomainCounts {
  imported: number;
  skipped: number;
  errors: number;
}

export interface ManifestReconcileResult {
  perDomain: Record<string, ManifestDomainCounts>;
  errorDetails: { domain: string; file: string; error: string }[];
  skippedDetails: { domain: string; file: string; reason: string }[];
}

export async function runManifestReconcile(
  godotRoot: string,
): Promise<ManifestReconcileResult> {
  const perDomain: Record<string, ManifestDomainCounts> = {};
  const errorDetails: { domain: string; file: string; error: string }[] = [];
  const skippedDetails: { domain: string; file: string; reason: string }[] = [];

  // Shared sub-resource declarations from the loaded manifest. All
  // entries in this pass consult the same map; pre-build once.
  const subResources = new Map<string, SubResource>();
  for (const sub of manifestCache.listSubResources()) {
    subResources.set(sub.subResource, sub);
  }

  for (const entry of manifestCache.listDomains()) {
    if (isFobDomainName(entry.domain)) {
      // Defensive guard: FoB names should not appear in a user manifest
      // (projectIndex classification gives FoB priority), but if they
      // do, refuse to write to the FoB cache and surface the collision.
      skippedDetails.push({
        domain: entry.domain,
        file: "(manifest declaration)",
        reason: `manifest domain "${entry.domain}" collides with FoB hardcoded domain — handled by FoB pass`,
      });
      continue;
    }

    if (entry.kind === "discriminatedFamily") {
      skippedDetails.push({
        domain: entry.domain,
        file: "(manifest declaration)",
        reason: `kind "discriminatedFamily" not yet supported by generic importer`,
      });
      perDomain[entry.domain] = { imported: 0, skipped: 1, errors: 0 };
      continue;
    }

    const counts: ManifestDomainCounts = { imported: 0, skipped: 0, errors: 0 };
    for (const indexed of projectIndex.list(entry.domain)) {
      try {
        const text = await fs.readFile(indexed.absPath, "utf8");
        const parsed = parseTres(text);
        const ctx: ReaderContext = {
          godotRoot,
          filePath: indexed.absPath,
          parsed,
          warnings: [],
          resolveRefByExtResource: (ext, targetDomain) => {
            const target = projectIndex.getByResPath(ext.path);
            if (!target) return null;
            // `id` field only exists on IndexedTres, not IndexedPickup.
            // Using the `in` check narrows the union cleanly (the
            // `domain: string | "pickup"` discriminator collapses to
            // string, so domain-based narrowing isn't reliable here).
            if (!("id" in target)) return null;
            if (target.domain !== targetDomain) return null;
            return target.id;
          },
          resPathToAbs: (p) => resPathToAbs(p, godotRoot),
          subResources,
        };
        const { entity, warnings } = readFromManifest(parsed, entry, ctx);
        if (!entity) {
          counts.skipped++;
          skippedDetails.push({
            domain: entry.domain,
            file: indexed.absPath,
            reason: warnings[0] ?? "generic importer returned null entity",
          });
          continue;
        }
        await writeEntity(entry, indexed.id, entity);
        counts.imported++;
      } catch (err) {
        counts.errors++;
        errorDetails.push({
          domain: entry.domain,
          file: indexed.absPath,
          error: (err as Error).message ?? String(err),
        });
      }
    }
    perDomain[entry.domain] = counts;
  }

  return { perDomain, errorDetails, skippedDetails };
}
