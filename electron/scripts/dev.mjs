// Dev launcher for the Electron window.
//
// Runs as part of `pnpm dev:desktop` alongside the Vite + Express dev
// servers (which `pnpm --parallel` boots from the root). Waits for Vite
// to start serving HTML on :5173, then spawns Electron with the dev URL
// set. No `wait-on` / `concurrently` deps — a tiny inline poll keeps it
// boring.
//
// On Electron exit, the launcher exits with the same code; the parallel
// pnpm runner keeps the Vite + Express children running until you ^C
// the terminal. That's fine for v1; tearing them down on window close
// is a Phase 2 nicety once we have a proper packaged build that owns
// the whole lifecycle.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(here, "..");
const mainJs = path.join(electronRoot, "dist", "main.js");

const VITE_URL = process.env.VITE_DEV_URL ?? "http://localhost:5173";
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

async function probe(url) {
  try {
    const res = await fetch(url, { method: "GET" });
    // Any HTTP response means the dev server's listening; we don't care
    // about the status (Vite returns 200 on /, but 404 would still mean
    // the server is up and answering).
    return res.status > 0;
  } catch {
    return false;
  }
}

async function waitForVite(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`[bleepforge/electron] waiting for ${url}`);
  while (Date.now() < deadline) {
    if (await probe(url)) {
      process.stdout.write(" ✓\n");
      return true;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  process.stdout.write(" ✗\n");
  return false;
}

async function main() {
  const ok = await waitForVite(VITE_URL, READY_TIMEOUT_MS);
  if (!ok) {
    console.error(
      `[bleepforge/electron] vite did not become ready at ${VITE_URL} within ${READY_TIMEOUT_MS}ms`,
    );
    process.exit(1);
  }

  // Resolve the electron binary the same way `electron` (the CLI) does:
  // its package main is a JS path string pointing at the platform binary.
  const require = createRequire(import.meta.url);
  const electronBin = require("electron");
  if (typeof electronBin !== "string") {
    console.error(
      "[bleepforge/electron] electron package didn't resolve to a binary path; " +
        "check that `electron` is installed under electron/node_modules.",
    );
    process.exit(1);
  }

  const child = spawn(electronBin, [mainJs], {
    // Pipe stdout/stderr so we can filter Chromium's harmless DevTools-
    // internal noise. The disable-features switch in main.ts doesn't
    // actually quiet these — they come from DevTools probing CDP methods
    // that Electron doesn't implement, regardless of the Autofill
    // feature flag. Filtering at the launcher is the reliable spot.
    stdio: ["inherit", "pipe", "pipe"],
    env: {
      ...process.env,
      BLEEPFORGE_ELECTRON_DEV: "1",
      VITE_DEV_URL: VITE_URL,
    },
  });

  // Lines matching this pattern are dropped — Chromium DevTools "Autofill
  // wasn't found" CDP errors. Add patterns here as new noise classes
  // surface; the filter is intentionally narrow so real errors aren't
  // swallowed.
  const NOISE = [
    /Request Autofill\.(enable|setAddresses) failed/,
    /'Autofill\.(enable|setAddresses)' wasn't found/,
  ];
  const isNoise = (line) => NOISE.some((re) => re.test(line));

  const pipeFiltered = (readable, writable) => {
    const rl = readline.createInterface({ input: readable, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!isNoise(line)) writable.write(line + "\n");
    });
  };
  pipeFiltered(child.stdout, process.stdout);
  pipeFiltered(child.stderr, process.stderr);

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("[bleepforge/electron] launcher failed:", err);
  process.exit(1);
});
