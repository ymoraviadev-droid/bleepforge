// Round-trip harness for Godot 4 .tres files.
//
// SAFETY CONTRACT (do not weaken without explicit decision):
//   - This script is READ-ONLY against GODOT_PROJECT_ROOT. It opens .tres files
//     only with fs.readFile. No fs.writeFile / fs.rename / fs.unlink call in
//     this file targets a path under GODOT_PROJECT_ROOT — see assertUnderStaging.
//   - All writes go to STAGING_ROOT (dialoguer/.tres-staging/), which is
//     gitignored and disposable. The path is derived from this file's
//     location, NOT from any environment variable.
//
// Usage:
//   pnpm --filter @bleepforge/server harness
//
// Reports per-file status (clean / differs / parse-error) and writes a
// summary to .tres-harness-report.txt at the repo root.

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTres } from "./parser.js";
import { emitTres } from "./emitter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// dialoguer/ root, derived from this file: server/src/tres/harness.ts.
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const STAGING_ROOT = resolve(REPO_ROOT, ".tres-staging");
const REPORT_PATH = resolve(REPO_ROOT, ".tres-harness-report.txt");

function assertUnderStaging(absPath: string): void {
  const rel = relative(STAGING_ROOT, absPath);
  if (rel.startsWith("..") || rel.startsWith(sep) || resolve(STAGING_ROOT, rel) !== absPath) {
    throw new Error(`Refusing to write outside staging: ${absPath}`);
  }
}

interface FileResult {
  relativePath: string;
  status: "clean" | "differs" | "parse-error";
  detail?: string;
}

async function main(): Promise<void> {
  const root = process.env.GODOT_PROJECT_ROOT;
  if (!root) {
    console.error("GODOT_PROJECT_ROOT not set. Add it to dialoguer/.env.");
    process.exit(2);
  }
  const astroRoot = resolve(root);
  try {
    const s = await stat(astroRoot);
    if (!s.isDirectory()) throw new Error("not a directory");
  } catch (err) {
    console.error(`GODOT_PROJECT_ROOT does not exist or is unreadable: ${astroRoot}`);
    console.error(String(err));
    process.exit(2);
  }

  console.log(`[harness] GODOT_PROJECT_ROOT (read-only): ${astroRoot}`);
  console.log(`[harness] STAGING_ROOT (writes): ${STAGING_ROOT}`);

  await mkdir(STAGING_ROOT, { recursive: true });

  const tresFiles: string[] = [];
  await walk(astroRoot, tresFiles);
  console.log(`[harness] found ${tresFiles.length} .tres files`);

  const results: FileResult[] = [];
  for (const abs of tresFiles) {
    const rel = relative(astroRoot, abs);
    const result = await processFile(abs, rel);
    results.push(result);
  }

  const clean = results.filter((r) => r.status === "clean").length;
  const differs = results.filter((r) => r.status === "differs").length;
  const errors = results.filter((r) => r.status === "parse-error").length;

  const report = renderReport(astroRoot, results);
  await writeFile(REPORT_PATH, report, "utf8");

  console.log("");
  console.log(`[harness] clean:  ${clean}`);
  console.log(`[harness] differs: ${differs}`);
  console.log(`[harness] errors:  ${errors}`);
  console.log(`[harness] report:  ${REPORT_PATH}`);

  if (differs > 0 || errors > 0) {
    // Show the first few interesting cases inline for quick feedback.
    const interesting = results.filter((r) => r.status !== "clean").slice(0, 5);
    for (const r of interesting) {
      console.log("");
      console.log(`--- ${r.status.toUpperCase()}: ${r.relativePath} ---`);
      console.log(r.detail ?? "");
    }
  }
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".godot") continue; // generated cache
    if (entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".tres")) out.push(full);
  }
}

async function processFile(abs: string, rel: string): Promise<FileResult> {
  let original: string;
  try {
    original = await readFile(abs, "utf8");
  } catch (err) {
    return { relativePath: rel, status: "parse-error", detail: `read failed: ${err}` };
  }

  let emitted: string;
  try {
    const doc = parseTres(original);
    emitted = emitTres(doc);
  } catch (err) {
    return {
      relativePath: rel,
      status: "parse-error",
      detail: err instanceof Error ? err.stack ?? err.message : String(err),
    };
  }

  // Stage the emitted file regardless of cleanliness — useful for diffing.
  const stagedPath = join(STAGING_ROOT, rel);
  assertUnderStaging(stagedPath);
  await mkdir(dirname(stagedPath), { recursive: true });
  await writeFile(stagedPath, emitted, "utf8");

  if (emitted === original) {
    return { relativePath: rel, status: "clean" };
  }
  return {
    relativePath: rel,
    status: "differs",
    detail: firstDiff(original, emitted),
  };
}

function firstDiff(a: string, b: string): string {
  // Show the first differing line plus a couple of lines of context.
  const aLines = a.split(/(?<=\n)/);
  const bLines = b.split(/(?<=\n)/);
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i++) {
    if (aLines[i] !== bLines[i]) {
      const ctxStart = Math.max(0, i - 2);
      const ctxEnd = Math.min(max, i + 3);
      const lines: string[] = [];
      for (let j = ctxStart; j < ctxEnd; j++) {
        const marker = j === i ? "!" : " ";
        lines.push(`${marker} L${j + 1}: orig=${JSON.stringify(aLines[j] ?? "")}`);
        if (j === i) {
          lines.push(`         emit=${JSON.stringify(bLines[j] ?? "")}`);
        }
      }
      lines.push(
        `(orig: ${aLines.length} lines, ${a.length} bytes; emit: ${bLines.length} lines, ${b.length} bytes)`,
      );
      return lines.join("\n");
    }
  }
  return `(no line-level diff found; orig=${a.length}B, emit=${b.length}B)`;
}

function renderReport(astroRoot: string, results: FileResult[]): string {
  const lines: string[] = [];
  lines.push(`# .tres round-trip harness report`);
  lines.push(`# astro-man root: ${astroRoot}`);
  lines.push(`# generated: ${new Date().toISOString()}`);
  lines.push("");
  const byStatus: Record<FileResult["status"], FileResult[]> = {
    clean: [],
    differs: [],
    "parse-error": [],
  };
  for (const r of results) byStatus[r.status].push(r);

  lines.push(`Summary: ${byStatus.clean.length} clean, ${byStatus.differs.length} differs, ${byStatus["parse-error"].length} errors`);
  lines.push("");

  if (byStatus["parse-error"].length > 0) {
    lines.push("## Parse errors");
    for (const r of byStatus["parse-error"]) {
      lines.push(`- ${r.relativePath}`);
      if (r.detail) lines.push(`    ${r.detail.replace(/\n/g, "\n    ")}`);
    }
    lines.push("");
  }
  if (byStatus.differs.length > 0) {
    lines.push("## Differs");
    for (const r of byStatus.differs) {
      lines.push(`- ${r.relativePath}`);
      if (r.detail) lines.push(`    ${r.detail.replace(/\n/g, "\n    ")}`);
    }
    lines.push("");
  }
  lines.push("## Clean");
  for (const r of byStatus.clean) lines.push(`- ${r.relativePath}`);
  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
