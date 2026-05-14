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
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(here, "..");
const repoRoot = path.resolve(electronRoot, "..");

// Target args we forward to electron-builder. Passing none lets it pick the
// host platform's defaults (Linux → AppImage on a Linux box). Multiple are
// allowed — e.g. `--linux --win` cross-builds both in one run.
const TARGET_FLAGS = new Set(["--linux", "--win", "--mac"]);
const targetArgs = process.argv.slice(2).filter((a) => TARGET_FLAGS.has(a));
const buildingLinux =
  targetArgs.length === 0 ||
  targetArgs.includes("--linux") ||
  process.platform === "linux";
const buildingWin = targetArgs.includes("--win");

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

  const targetLabel = targetArgs.length > 0 ? targetArgs.join(" ") : "host platform";
  console.log(`[bleepforge/dist] 4/4 running electron-builder (${targetLabel})…`);
  // Config lives in electron-builder.json (not in package.json) so
  // electron-builder's extraMetadata.* can't accidentally rewrite the
  // source package.json — observed once: setting extraMetadata.name in
  // package.json's `build` field caused the source package.json to be
  // overwritten with the trimmed prod metadata. Separate file = no
  // ambiguity about which file is the source.
  await run(
    "pnpm",
    [
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.json",
      ...targetArgs,
    ],
    electronRoot,
  );

  // Sidecar icon next to the AppImage. KDE Dolphin / GNOME Files don't
  // peek inside the AppImage's squashfs to render its embedded icon
  // unless the user has libappimage / appimaged installed (Fedora and
  // most distros don't ship that out of the box). Copying the 512px
  // PNG to release/Bleepforge.png gives the user an immediately-
  // visible icon in their file manager right next to the AppImage —
  // no thumbnailer required. Tiny (~4KB) compared to the 115MB
  // binary, free win. Skipped on Windows-only builds — the .ico is
  // embedded in the .exe and Explorer renders it natively.
  if (buildingLinux && fs.existsSync(path.join(electronRoot, "release"))) {
    console.log("[bleepforge/dist] copying sidecar icon to release/Bleepforge.png…");
    fs.copyFileSync(
      path.join(electronRoot, "build-resources", "icons", "512x512.png"),
      path.join(electronRoot, "release", "Bleepforge.png"),
    );
  }

  console.log("[bleepforge/dist] done. Artifacts in electron/release/");
  if (buildingLinux) {
    console.log("[bleepforge/dist] tip: run `pnpm install:desktop` once to");
    console.log("[bleepforge/dist] register Bleepforge in the KDE/GNOME app menu.");
  }
  if (buildingWin) {
    console.log("[bleepforge/dist] windows installer: Bleepforge-Setup-*.exe in electron/release/");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
