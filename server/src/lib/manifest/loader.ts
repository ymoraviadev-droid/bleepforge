// Read + parse + validate the user project's bleepforge_manifest.json.
//
// The library on the Godot side (godot-lib) emits this file at the project
// root every time the editor loads (per v0.2.6 Phase 3). Bleepforge's
// editor-side consumer (Phase 4) reads it from here, validates it against
// the canonical zod schema in shared/, and surfaces it via the
// /api/manifest endpoint for the Diagnostics → Manifest tab.
//
// Returns one of four discriminated states. `not-applicable` covers
// notebook-mode projects (no Godot root → no manifest possible by
// construction). `missing` covers sync-mode projects where the user
// hasn't installed godot-lib yet (or hasn't enabled the plugin). `error`
// covers parse failures — usually a schema mismatch from a library
// version skew. `ok` is the happy path.
//
// No caching here — the diagnostic use case calls this on demand and
// stat+read is cheap. If a v0.2.7+ feature ever needs the manifest on
// the hot path, layer a cache module on top.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type Manifest,
  ManifestSchema,
  MANIFEST_FILENAME,
} from "@bleepforge/shared";
import { config, isSyncMode } from "../../config.js";

export type ManifestLoadStatus = "not-applicable" | "missing" | "ok" | "error";

export interface ManifestLoadResult {
  /** Discriminator. The other fields are populated per status. */
  status: ManifestLoadStatus;
  /** Absolute filesystem path. Set when status is "missing", "ok", or "error" — i.e. whenever a Godot root is configured (so we know WHERE we'd look). */
  filePath?: string;
  /** Godot res:// path equivalent. Same conditions as filePath. */
  resPath?: string;
  /** File modification time as ISO string. Set when status is "ok" or "error" (file existed). */
  mtime?: string;
  /** File size in bytes. Set when status is "ok" or "error". */
  sizeBytes?: number;
  /** The parsed manifest. Set when status is "ok". */
  manifest?: Manifest;
  /** Human-readable parse / validation error. Set when status is "error". */
  error?: string;
  /** Detailed zod issue list, when applicable. Set when status is "error" + the failure was schema validation (not raw JSON parse / IO). */
  issues?: ManifestValidationIssue[];
  /** Why the manifest isn't applicable (notebook mode, no Godot root). Set when status is "not-applicable". */
  reason?: string;
}

export interface ManifestValidationIssue {
  /** Path within the manifest where validation failed (e.g. "domains[0].fields.Slug.type"). */
  path: string;
  message: string;
}

/**
 * Read + parse + validate the active project's bleepforge_manifest.json.
 * Always non-throwing; failures land in the returned discriminated result.
 */
export async function loadManifest(): Promise<ManifestLoadResult> {
  // Notebook mode: no Godot root by design, so the manifest concept doesn't
  // apply. Return early so the diagnostic UI can render a "not relevant for
  // this project" state instead of a misleading "missing" one.
  if (!isSyncMode() || !config.godotProjectRoot) {
    return {
      status: "not-applicable",
      reason:
        config.projectMode === "notebook"
          ? "Notebook-mode projects don't have a Godot project root, so there's no manifest to read."
          : "No Godot project root configured for the active project.",
    };
  }

  const filePath = path.join(config.godotProjectRoot, MANIFEST_FILENAME);
  const resPath = `res://${MANIFEST_FILENAME}`;

  // Stat first so we can distinguish "never been emitted" (ENOENT) from
  // "exists but malformed" (parse error).
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing", filePath, resPath };
    }
    return {
      status: "error",
      filePath,
      resPath,
      error: `Cannot stat ${filePath}: ${(err as Error).message}`,
    };
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    return {
      status: "error",
      filePath,
      resPath,
      mtime: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      error: `Cannot read ${filePath}: ${(err as Error).message}`,
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      status: "error",
      filePath,
      resPath,
      mtime: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      error: `Invalid JSON: ${(err as Error).message}`,
    };
  }

  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      status: "error",
      filePath,
      resPath,
      mtime: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      error: `Manifest schema validation failed (${parsed.error.issues.length} issue${parsed.error.issues.length === 1 ? "" : "s"}).`,
      issues: parsed.error.issues.map((iss) => ({
        path: iss.path.length > 0 ? iss.path.join(".") : "(root)",
        message: iss.message,
      })),
    };
  }

  return {
    status: "ok",
    filePath,
    resPath,
    mtime: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    manifest: parsed.data,
  };
}
