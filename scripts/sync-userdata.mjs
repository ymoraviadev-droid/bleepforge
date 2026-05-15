#!/usr/bin/env node
// Bidirectional sync between the AppImage's userData and the repo's
// projects/ tree.
//
// The packaged app reads/writes user state under
// ~/.config/Bleepforge/projects/<slug>/data/ (Linux; the equivalent on
// macOS / Windows via Electron's app.setName). When Yehonatan authors
// Concept / Codex / Help content in the AppImage, that work lives
// outside the repo — this script ferries it back so the next git
// commit + build picks it up.
//
// Two directions:
//
//   pnpm sync:from-userdata  (userData → repo) — bring AppImage edits
//     back into git. Most common direction for the daily workflow.
//
//   pnpm sync:to-userdata    (repo → userData) — push fresh repo content
//     into the running AppImage. Useful after `git pull` to see new help
//     entries / codex categories in the app without re-downloading.
//
// Sync-eligible files (the Bleepforge-only authored content; everything
// else under data/ is either machine-local cache or .gitignore'd):
//   <slug>/data/concept.json
//   <slug>/data/codex/**
//   <slug>/data/help/**
//   <slug>/data/dialogs/<folder>/_layout.json
//   <slug>/data/shaders/_meta.json
//
// Walks every project on EITHER side: if a project exists only on the
// source it gets created on the destination; orphans (only on dest)
// are reported but not touched. Slugs that exist on both sides are
// compared file-by-file via sha256.
//
// Defaults to dry-run with an inline confirmation prompt. Pass --yes / -y
// to skip the prompt. Deletions are NOT propagated in v1 — if a file
// exists on the destination but not the source, the script warns and
// leaves it alone. Delete-propagation is a follow-up if it ever bites.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const REPO_PROJECTS = path.join(REPO_ROOT, "projects");
const USERDATA_ROOT = resolveUserDataRoot();
const USERDATA_PROJECTS = path.join(USERDATA_ROOT, "projects");

function resolveUserDataRoot() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Bleepforge");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? home, "Bleepforge");
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"),
    "Bleepforge",
  );
}

// ─── CLI parse ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const direction = args[0];
const autoYes = args.includes("--yes") || args.includes("-y");

if (direction !== "from" && direction !== "to") {
  console.error("Usage: sync-userdata.mjs <from|to> [-y]");
  console.error("");
  console.error("  from    userData → repo  (pull AppImage edits into git)");
  console.error("  to      repo → userData  (push repo content into running app)");
  console.error("  -y      apply without confirmation prompt");
  process.exit(1);
}

const srcProjects = direction === "from" ? USERDATA_PROJECTS : REPO_PROJECTS;
const dstProjects = direction === "from" ? REPO_PROJECTS : USERDATA_PROJECTS;
const srcLabel = direction === "from" ? "userData" : "repo";
const dstLabel = direction === "from" ? "repo" : "userData";

console.log(`Source:      ${srcLabel}  (${srcProjects})`);
console.log(`Destination: ${dstLabel}  (${dstProjects})`);
console.log("");

if (!fs.existsSync(srcProjects)) {
  console.error(
    `Source projects/ does not exist: ${srcProjects}\n` +
      (direction === "from"
        ? "Have you launched the AppImage at least once?"
        : "Run the dev server once to trigger the v0.2.5 migration."),
  );
  process.exit(1);
}

// ─── Walk + classify ────────────────────────────────────────────────────

/** Discover project slugs (immediate subdirs of `projects/` that have
 *  a `data/` child). */
function listProjectSlugs(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (fs.existsSync(path.join(root, entry.name, "data"))) {
      out.push(entry.name);
    }
  }
  return out;
}

/** Yield project-relative paths (relative to projects/) for every
 *  sync-eligible file under one slug's data/ dir. */
function* walkSyncable(slug, projectsRoot) {
  const dataRoot = path.join(projectsRoot, slug, "data");
  // Top-level singletons
  for (const rel of ["concept.json", "shaders/_meta.json"]) {
    const abs = path.join(dataRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      yield path.join(slug, "data", rel);
    }
  }
  // Whole-tree recursive directories
  for (const dir of ["codex", "help"]) {
    yield* walkDir(path.join(dataRoot, dir), projectsRoot);
  }
  // Dialog layouts only (not the cache JSONs)
  const dialogsRoot = path.join(dataRoot, "dialogs");
  if (fs.existsSync(dialogsRoot)) {
    for (const folder of fs.readdirSync(dialogsRoot, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const layout = path.join(dialogsRoot, folder.name, "_layout.json");
      if (fs.existsSync(layout)) {
        yield path.relative(projectsRoot, layout);
      }
    }
  }
}

function* walkDir(start, projectsRoot) {
  if (!fs.existsSync(start)) return;
  for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
    const abs = path.join(start, entry.name);
    if (entry.isDirectory()) yield* walkDir(abs, projectsRoot);
    else if (entry.isFile()) yield path.relative(projectsRoot, abs);
  }
}

function sha(absPath) {
  return createHash("sha256")
    .update(fs.readFileSync(absPath))
    .digest("hex");
}

const srcSlugs = new Set(listProjectSlugs(srcProjects));
const dstSlugs = new Set(listProjectSlugs(dstProjects));
const allSlugs = new Set([...srcSlugs, ...dstSlugs]);

const srcFiles = new Set();
const dstFiles = new Set();
for (const slug of srcSlugs) {
  for (const rel of walkSyncable(slug, srcProjects)) srcFiles.add(rel);
}
for (const slug of dstSlugs) {
  for (const rel of walkSyncable(slug, dstProjects)) dstFiles.add(rel);
}
const allFiles = new Set([...srcFiles, ...dstFiles]);

const plan = {
  add: [], // new in src, missing in dst
  update: [], // exists in both, different content
  unchanged: [], // exists in both, same content
  orphan: [], // exists in dst only — won't be touched
};
const onlyOnSrcProjects = []; // slugs present on src but not dst — get created
const onlyOnDstProjects = []; // slugs present on dst but not src — left alone

for (const slug of [...allSlugs].sort()) {
  if (srcSlugs.has(slug) && !dstSlugs.has(slug)) onlyOnSrcProjects.push(slug);
  else if (!srcSlugs.has(slug) && dstSlugs.has(slug)) onlyOnDstProjects.push(slug);
}

for (const rel of [...allFiles].sort()) {
  const inSrc = srcFiles.has(rel);
  const inDst = dstFiles.has(rel);
  if (inSrc && !inDst) plan.add.push(rel);
  else if (!inSrc && inDst) plan.orphan.push(rel);
  else {
    const hashSrc = sha(path.join(srcProjects, rel));
    const hashDst = sha(path.join(dstProjects, rel));
    if (hashSrc === hashDst) plan.unchanged.push(rel);
    else plan.update.push(rel);
  }
}

// ─── Print summary ──────────────────────────────────────────────────────

const willCopy = plan.add.length + plan.update.length;

if (onlyOnSrcProjects.length > 0) {
  console.log(
    `New projects on ${srcLabel} (${onlyOnSrcProjects.length}):`,
  );
  for (const slug of onlyOnSrcProjects) console.log(`  + ${slug}/`);
  console.log("");
}
if (onlyOnDstProjects.length > 0) {
  console.log(
    `Projects only on ${dstLabel} (${onlyOnDstProjects.length}) — left alone:`,
  );
  for (const slug of onlyOnDstProjects) console.log(`  ! ${slug}/`);
  console.log("");
}

function printGroup(label, items, marker) {
  if (items.length === 0) return;
  console.log(`${label} (${items.length}):`);
  for (const rel of items) console.log(`  ${marker} ${rel}`);
  console.log("");
}

printGroup("New files to copy", plan.add, "+");
printGroup("Files to overwrite", plan.update, "~");
if (plan.orphan.length > 0) {
  console.log(
    `Orphans on ${dstLabel} (${plan.orphan.length}) — present on destination but missing on source.`,
  );
  console.log("These will NOT be touched. Delete manually if you want them gone:");
  for (const rel of plan.orphan) console.log(`  ! ${rel}`);
  console.log("");
}
console.log(
  `Summary: ${plan.add.length} new, ${plan.update.length} changed, ${plan.unchanged.length} unchanged, ${plan.orphan.length} orphan.`,
);

if (willCopy === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

// ─── Confirm ────────────────────────────────────────────────────────────

async function confirm() {
  if (autoYes) return true;
  if (!process.stdin.isTTY) {
    console.error(
      "\nstdin is not a TTY — pass --yes (or -y) to apply without a prompt.",
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(
      `\nApply ${willCopy} file change(s) to ${dstLabel}? [y/N] `,
      (a) => {
        rl.close();
        resolve(a);
      },
    );
  });
  return answer.trim().toLowerCase() === "y";
}

if (!(await confirm())) {
  console.log("Cancelled.");
  process.exit(0);
}

// ─── Apply ──────────────────────────────────────────────────────────────

let copied = 0;
for (const rel of [...plan.add, ...plan.update]) {
  const srcAbs = path.join(srcProjects, rel);
  const dstAbs = path.join(dstProjects, rel);
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.copyFileSync(srcAbs, dstAbs);
  copied++;
}
console.log(`Copied ${copied} file(s) to ${dstLabel}.`);
