// Boot-time .tres → JSON cache reconcile. Called once from index.ts after
// app.listen opens the port (so health-check clients aren't blocked) but
// before the watcher starts (so we don't double-process churn during
// startup). Caches the result for `GET /api/reconcile/status` so the
// Diagnostics → Reconcile tab + the header severity icon surface skip /
// error counts; logs a compact one-liner plus per-file detail at warn /
// error level (so the same anomalies show up tagged in the Logs tab).
//
// If runImport itself throws (e.g. project root inaccessible), the server
// logs and continues with whatever JSON is on disk — better degraded than
// down.

import { config } from "../../config.js";
import { runImport } from "../../internal/import/orchestrator.js";
import { runManifestReconcile } from "./manifestReconcile.js";
import { setReconcileStatus, type DomainCounts } from "./router.js";

const RECONCILED_DOMAINS = [
  "items",
  "quests",
  "karma",
  "factions",
  "npcs",
  "dialogs",
  "balloons",
] as const;
type ReconciledDomain = (typeof RECONCILED_DOMAINS)[number];

export async function runBootReconcile(): Promise<void> {
  console.log(`[bleepforge/server] reconciling JSON cache from .tres ...`);
  const t0 = Date.now();
  try {
    const result = await runImport({
      godotProjectRoot: config.godotProjectRoot!,
    });

    // Flatten per-domain errors / skips into one list each. Each domain's
    // result type carries `{ imported, skipped, errors }` arrays (the
    // dialogs + balloons buckets carry richer per-entry shapes but their
    // `.file`/`.error`/`.reason` keys match the others).
    const errorDetails: { domain: string; file: string; error: string }[] = [];
    const skippedDetails: { domain: string; file: string; reason: string }[] =
      [];
    for (const dom of RECONCILED_DOMAINS) {
      for (const e of result.domains[dom].errors) {
        errorDetails.push({ domain: dom, file: e.file, error: e.error });
      }
      for (const s of result.domains[dom].skipped) {
        skippedDetails.push({ domain: dom, file: s.file, reason: s.reason });
      }
    }

    const perDomain = Object.fromEntries(
      RECONCILED_DOMAINS.map((dom) => [
        dom,
        countsOf(
          result.domains[dom].imported.length,
          result.domains[dom].skipped.length,
          result.domains[dom].errors.length,
        ),
      ]),
    ) as Record<ReconciledDomain, DomainCounts>;

    // Manifest-discovered domains: runs after FoB so FoB classifiers
    // win on collision. Best-effort — errors here don't flip ok=false
    // (per-entry errors already collected into errorDetails alongside
    // FoB's).
    const manifest = await runManifestReconcile(config.godotProjectRoot!);
    for (const e of manifest.errorDetails) errorDetails.push(e);
    for (const s of manifest.skippedDetails) skippedDetails.push(s);

    const durationMs = Date.now() - t0;

    setReconcileStatus({
      ranAt: new Date().toISOString(),
      durationMs,
      ok: true,
      perDomain,
      manifestDomains: manifest.perDomain,
      errorDetails,
      skippedDetails,
    });

    // Compact one-liner. Per-domain segment looks like `dialogs=43` when
    // clean and `dialogs=42 (skipped:1)` or `quests=3 (errors:1)` when
    // not, so anomalies pop without drowning the log on a healthy boot.
    // Manifest-discovered domains land in the same line after the FoB
    // section, prefixed with `manifest:` so they're visually distinct
    // (e.g. `manifest:notes=4`).
    const segments: string[] = [];
    for (const [name, c] of Object.entries(perDomain)) {
      segments.push(formatSegment(name, c));
    }
    for (const [name, c] of Object.entries(manifest.perDomain)) {
      segments.push(formatSegment(`manifest:${name}`, c));
    }
    console.log(
      `[bleepforge/server] reconcile ok in ${durationMs}ms — ${segments.join(" ")}`,
    );
    // Per-file detail lines: use console.error / console.warn so the log
    // buffer tags them correctly (Diagnostics → Logs filters by level).
    // The Reconcile tab is the canonical surface for these — Logs is just
    // the aggregated stream.
    for (const e of errorDetails) {
      console.error(
        `[bleepforge/server]   error: ${e.domain} ${e.file} — ${e.error}`,
      );
    }
    for (const s of skippedDetails) {
      console.warn(
        `[bleepforge/server]   skipped: ${s.domain} ${s.file} — ${s.reason}`,
      );
    }
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[bleepforge/server] reconcile FAILED: ${message}`);
    console.error(
      `[bleepforge/server] continuing with whatever JSON is currently on disk`,
    );
    setReconcileStatus({
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      ok: false,
      perDomain: emptyPerDomain(),
      manifestDomains: {},
      errorDetails: [],
      skippedDetails: [],
      error: message,
    });
  }
}

function countsOf(
  imported: number,
  skipped: number,
  errors: number,
): DomainCounts {
  return { imported, skipped, errors };
}

function emptyPerDomain(): Record<ReconciledDomain, DomainCounts> {
  const z = countsOf(0, 0, 0);
  return Object.fromEntries(
    RECONCILED_DOMAINS.map((d) => [d, z]),
  ) as Record<ReconciledDomain, DomainCounts>;
}

function formatSegment(name: string, c: DomainCounts): string {
  const tags: string[] = [];
  if (c.skipped > 0) tags.push(`skipped:${c.skipped}`);
  if (c.errors > 0) tags.push(`errors:${c.errors}`);
  return tags.length === 0
    ? `${name}=${c.imported}`
    : `${name}=${c.imported} (${tags.join(",")})`;
}
