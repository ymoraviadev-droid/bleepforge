#!/usr/bin/env node
// Bleepforge packaged-binary build orchestration.
//
// Order matters:
//   1. Build the client (Vite → client/dist).
//   2. Build the server bundle (esbuild → server/dist-bundle/server.mjs).
//      Workspace deps like @bleepforge/shared get inlined; npm deps
//      (express, chokidar, zod) stay external and ship in node_modules.
//   3. Build electron main + preload (tsc → electron/dist/*.js).
//   4. Run electron-builder against electron/package.json's `build` config.
//
// We DON'T run shared's tsc (no build script — Vite/tsx/esbuild all read
// the .ts source directly). Server's tsc build is also skipped here in
// favor of the esbuild bundle, which avoids the @bleepforge/shared
// workspace-resolution problem at runtime.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(here, "..");
const repoRoot = path.resolve(electronRoot, "..");

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  console.log("[bleepforge/dist] 1/4 building client (vite)…");
  await run("pnpm", ["--filter", "@bleepforge/client", "run", "build"], repoRoot);

  console.log("[bleepforge/dist] 2/4 bundling server (esbuild)…");
  await run("pnpm", ["--filter", "@bleepforge/server", "run", "build:bundle"], repoRoot);

  console.log("[bleepforge/dist] 3/4 building electron main (tsc)…");
  await run("pnpm", ["--filter", "@bleepforge/electron", "run", "build"], repoRoot);

  console.log("[bleepforge/dist] 4/4 running electron-builder…");
  // Config lives in electron-builder.json (not in package.json) so
  // electron-builder's extraMetadata.* can't accidentally rewrite the
  // source package.json — observed once: setting extraMetadata.name in
  // package.json's `build` field caused the source package.json to be
  // overwritten with the trimmed prod metadata. Separate file = no
  // ambiguity about which file is the source.
  await run(
    "pnpm",
    ["exec", "electron-builder", "--config", "electron-builder.json"],
    electronRoot,
  );

  console.log("[bleepforge/dist] done. Artifacts in electron/release/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
