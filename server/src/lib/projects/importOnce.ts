// Import-once seeding for notebook projects (v0.2.6 phase 7).
//
// Flow shape: a deferred import. POST /api/projects/import-once creates a
// notebook project's data/ + content/ dirs, writes a pending-import
// manifest into data/, sets active, and tells the client to restart.
// On the next boot the runtime detects the manifest and runs the seed
// IN THE CONTEXT of the newly-active project — which means the existing
// reconcile machinery, folderAbs, and per-domain storage modules all
// resolve to the right paths automatically. No deep refactor needed.
//
// After the seed completes, the project is a normal notebook project —
// subsequent boots skip reconcile (notebook mode gate), and content/
// holds the copied PNGs / .gdshader files referenced by the imported
// JSON.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { runImport } from "../../internal/import/orchestrator.js";
import { projectIndex } from "../projectIndex/index.js";
import { CONTENT_SCHEME } from "../assets/pathScheme.js";

export const PENDING_IMPORT_FILENAME = ".bleepforge-pending-import.json";

export interface PendingImportManifest {
  schemaVersion: 1;
  /** Absolute path to the Godot project to seed from. Discarded after
   *  the one-shot import completes. */
  sourceGodotRoot: string;
  createdAt: string;
}

export function pendingImportPath(dataRoot: string): string {
  return path.join(dataRoot, PENDING_IMPORT_FILENAME);
}

export function writePendingImport(
  dataRoot: string,
  manifest: PendingImportManifest,
): void {
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(
    pendingImportPath(dataRoot),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

export function readPendingImport(
  dataRoot: string,
): PendingImportManifest | null {
  const file = pendingImportPath(dataRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.schemaVersion === 1 &&
      typeof parsed.sourceGodotRoot === "string"
    ) {
      return parsed as PendingImportManifest;
    }
  } catch {
    // ignore — treated as no manifest
  }
  return null;
}

export function clearPendingImport(dataRoot: string): void {
  try {
    fs.unlinkSync(pendingImportPath(dataRoot));
  } catch {
    // ignore — the seed already ran successfully even if cleanup failed
  }
}

/** Result summary for boot logging. */
export interface ImportOnceResult {
  importedTres: number;
  copiedAssets: number;
  rewrittenRefs: number;
  contentRoot: string;
  durationMs: number;
}

/** Boot-time entry point. Runs the full one-shot seed against
 *  `sourceGodotRoot`, writing the populated JSON cache into the active
 *  project's data/ dir and copying referenced assets into its content/
 *  dir. Called from app.ts before normal reconcile gates fire. */
export async function runPendingImport(
  sourceGodotRoot: string,
): Promise<ImportOnceResult> {
  const t0 = Date.now();
  const absSource = path.resolve(sourceGodotRoot);

  if (!config.contentRoot) {
    throw new Error("no contentRoot — cannot run import-once seed");
  }
  const contentRoot = config.contentRoot;

  // Step 1: Build the project index against the SOURCE Godot tree so
  // every .tres lookup in the import mappers resolves correctly. This
  // mutates the singleton's contents; subsequent (notebook-mode) boots
  // won't rebuild it, but the index is only consumed by sync-path code
  // which the mode gate already disables.
  await projectIndex.build(absSource);

  // Step 2: Run the existing import orchestrator. It writes JSON to
  // folderAbs.* which (post-restart) points at the new project's data/.
  const importResult = await runImport({ godotProjectRoot: absSource });
  const importedTres =
    importResult.domains.items.imported.length +
    importResult.domains.quests.imported.length +
    importResult.domains.karma.imported.length +
    importResult.domains.factions.imported.length +
    importResult.domains.npcs.imported.length +
    importResult.domains.dialogs.imported.length +
    importResult.domains.balloons.imported.length;

  // Step 3: Walk every JSON file in data/ and rewrite absolute paths
  // pointing under absSource into project-relative content:// references.
  // Side effect: copies referenced files from source → contentRoot.
  const { copied, rewritten } = await rewriteAndCopy({
    sourceGodotRoot: absSource,
    contentRoot,
    dataRoot: config.dataRoot,
  });

  return {
    importedTres,
    copiedAssets: copied,
    rewrittenRefs: rewritten,
    contentRoot,
    durationMs: Date.now() - t0,
  };
}

interface RewriteOpts {
  sourceGodotRoot: string;
  contentRoot: string;
  dataRoot: string;
}

interface RewriteResult {
  copied: number;
  rewritten: number;
}

/** Recursive walk of data/ rewriting absolute paths → content://. Copies
 *  each referenced file from the source Godot tree into contentRoot
 *  preserving its relative path. Skips strings that don't point under
 *  the source root, and strings that don't reference an existing file. */
async function rewriteAndCopy(opts: RewriteOpts): Promise<RewriteResult> {
  const copiedPaths = new Set<string>();
  let rewritten = 0;

  const sourcePrefix = opts.sourceGodotRoot.endsWith(path.sep)
    ? opts.sourceGodotRoot
    : `${opts.sourceGodotRoot}${path.sep}`;

  async function processFile(filePath: string): Promise<void> {
    let text: string;
    try {
      text = await fsp.readFile(filePath, "utf8");
    } catch {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const before = JSON.stringify(parsed);
    const transformed = await transformValue(parsed);
    const after = JSON.stringify(transformed);
    if (after !== before) {
      await fsp.writeFile(filePath, JSON.stringify(transformed, null, 2), "utf8");
    }
  }

  async function transformValue(value: unknown): Promise<unknown> {
    if (typeof value === "string") {
      return await maybeRewrite(value);
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const item of value) out.push(await transformValue(item));
      return out;
    }
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = await transformValue(v);
      }
      return out;
    }
    return value;
  }

  async function maybeRewrite(s: string): Promise<string> {
    if (s.startsWith(CONTENT_SCHEME)) return s; // already portable
    if (!s.startsWith(sourcePrefix) && s !== opts.sourceGodotRoot) return s;
    const rel = path.relative(opts.sourceGodotRoot, s);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return s;
    const target = path.join(opts.contentRoot, rel);
    // Copy the source file if it exists + we haven't already. Don't
    // rewrite refs for files that aren't on disk — leave the string
    // unchanged so the existing dangling-ref integrity check surfaces it.
    if (!copiedPaths.has(s)) {
      try {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.copyFile(s, target);
        copiedPaths.add(s);
      } catch {
        return s;
      }
    }
    rewritten++;
    return `${CONTENT_SCHEME}${rel.split(path.sep).join("/")}`;
  }

  async function walkDir(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        await walkDir(full);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        if (entry.name.startsWith(".")) continue;
        await processFile(full);
      }
    }
  }

  await walkDir(opts.dataRoot);
  return { copied: copiedPaths.size, rewritten };
}
