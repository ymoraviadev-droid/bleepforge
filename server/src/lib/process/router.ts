// Server process info — Diagnostics → Process tab. Read-only snapshot of
// what the server thinks it's doing: who am I, where am I pointing, how
// long have I been up. Useful when debugging "wait, is the running server
// even using the project I think it is?" — common after editing prefs and
// forgetting to restart, or running multiple checkouts.

import { readFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";

import { config } from "../../config.js";

const startedAtMs = Date.now();

// Bleepforge version comes from the root package.json. Cached on first read
// so we don't hit disk per request.
let cachedVersion: string | null = null;
async function readBleepforgeVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const rootPkgPath = join(here, "..", "..", "..", "package.json");
    const raw = await readFile(rootPkgPath, "utf8");
    const v = (JSON.parse(raw) as { version?: string }).version;
    cachedVersion = typeof v === "string" ? v : "unknown";
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion;
}

export interface ProcessInfo {
  bleepforgeVersion: string;
  nodeVersion: string;
  platform: string;
  pid: number;
  port: number;
  startedAt: string;
  uptimeMs: number;
  dataRoot: string;
  assetRoot: string;
  godotProjectRoot: string | null;
  godotProjectRootSource: "project" | "env" | null;
  bleepforgeRoot: string;
  activeProjectSlug: string | null;
}

export const processRouter: Router = Router();

processRouter.get("/", async (_req, res) => {
  const info: ProcessInfo = {
    bleepforgeVersion: await readBleepforgeVersion(),
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    pid: process.pid,
    port: config.port,
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeMs: Date.now() - startedAtMs,
    dataRoot: config.dataRoot,
    assetRoot: config.assetRoot,
    godotProjectRoot: config.godotProjectRoot,
    godotProjectRootSource: config.godotProjectRootSource,
    bleepforgeRoot: config.bleepforgeRoot,
    activeProjectSlug: config.activeProjectSlug,
  };
  res.json(info);
});
