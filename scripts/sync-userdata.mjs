#!/usr/bin/env node
// Bidirectional sync between the AppImage's userData and the repo's data/.
//
// The packaged app reads/writes user state under ~/.config/Bleepforge/data/
// (Linux; ~/Library/Application Support/Bleepforge/data on macOS;
// %APPDATA%/Bleepforge/data on Windows). When Yehonatan authors Concept /
// Codex / Help content in the AppImage, that work lives outside the repo
// — this script ferries it back so the next git commit + build picks it up.
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
//   concept.json
//   codex/**
//   help/**
//   dialogs/<folder>/_layout.json
//   shaders/_meta.json
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
const REPO_DATA = path.join(REPO_ROOT, "data");
const USERDATA_ROOT = resolveUserDataRoot();
const USERDATA_DATA = path.join(USERDATA_ROOT, "data");

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

const src = direction === "from" ? USERDATA_DATA : REPO_DATA;
const dst = direction === "from" ? REPO_DATA : USERDATA_DATA;
const srcLabel = direction === "from" ? "userData" : "repo";
const dstLabel = direction === "from" ? "repo" : "userData";

console.log(`Source:      ${srcLabel}  (${src})`);
console.log(`Destination: ${dstLabel}  (${dst})`);
console.log("");

if (!fs.existsSync(src)) {
  console.error(
    `Source directory does not exist: ${src}\n` +
      (direction === "from"
        ? "Have you launched the AppImage at least once?"
        : "This shouldn't happen — the repo's data/ should always exist."),
  );
  process.exit(1);
}

// ─── Walk + classify ────────────────────────────────────────────────────

/** Yield relative paths (relative to root) for every sync-eligible file. */
function* walkSyncable(root) {
  // Top-level singletons
  for (const rel of ["concept.json", "shaders/_meta.json"]) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) yield rel;
  }
  // Whole-tree recursive directories
  for (const dir of ["codex", "help"]) {
    yield* walkDir(path.join(root, dir), root);
  }
  // Dialog layouts only (not the cache JSONs)
  const dialogsRoot = path.join(root, "dialogs");
  if (fs.existsSync(dialogsRoot)) {
    for (const folder of fs.readdirSync(dialogsRoot, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const layout = path.join(dialogsRoot, folder.name, "_layout.json");
      if (fs.existsSync(layout)) {
        yield path.relative(root, layout);
      }
    }
  }
}

function* walkDir(start, root) {
  if (!fs.existsSync(start)) return;
  for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
    const abs = path.join(start, entry.name);
    if (entry.isDirectory()) yield* walkDir(abs, root);
    else if (entry.isFile()) yield path.relative(root, abs);
  }
}

function sha(absPath) {
  return createHash("sha256")
    .update(fs.readFileSync(absPath))
    .digest("hex");
}

const srcFiles = new Set(walkSyncable(src));
const dstFiles = new Set(walkSyncable(dst));
const allFiles = new Set([...srcFiles, ...dstFiles]);

const plan = {
  add: [], // new in src, missing in dst
  update: [], // exists in both, different content
  unchanged: [], // exists in both, same content
  orphan: [], // exists in dst only — won't be touched
};

for (const rel of [...allFiles].sort()) {
  const inSrc = srcFiles.has(rel);
  const inDst = dstFiles.has(rel);
  if (inSrc && !inDst) plan.add.push(rel);
  else if (!inSrc && inDst) plan.orphan.push(rel);
  else {
    const hashSrc = sha(path.join(src, rel));
    const hashDst = sha(path.join(dst, rel));
    if (hashSrc === hashDst) plan.unchanged.push(rel);
    else plan.update.push(rel);
  }
}

// ─── Print summary ──────────────────────────────────────────────────────

const willCopy = plan.add.length + plan.update.length;

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
  const srcAbs = path.join(src, rel);
  const dstAbs = path.join(dst, rel);
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.copyFileSync(srcAbs, dstAbs);
  copied++;
}
console.log(`Copied ${copied} file(s) to ${dstLabel}.`);
