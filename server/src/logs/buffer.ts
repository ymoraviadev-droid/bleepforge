// In-memory ring buffer for server-side logs, surfaced to the UI via
// /api/logs and rolled into the Diagnostics header severity. Captures by
// monkey-patching console.{log, info, warn, error} once at module load:
//
//   - console.* calls still go to the original stdout/stderr (pnpm dev
//     terminal stays useful), AND get pushed into the buffer.
//   - The buffer is bounded at MAX_ENTRIES so a long-running server can't
//     leak memory. Old entries roll out as new ones arrive.
//   - Levels are mapped: log/info → "info", warn → "warning", error → "error".
//
// This module must be imported BEFORE any other module that calls console
// during its own load (otherwise early log lines escape the buffer). Easiest
// way: import it at the very top of server/src/index.ts.
//
// We intentionally don't reach for Pino/Winston yet — the existing codebase
// uses console.* freely and we want to capture those without rewriting
// every call site. If structured logging becomes valuable later, the
// buffer interface (publish/list) stays the same; the publisher swaps.

const MAX_ENTRIES = 1000;

export type LogLevel = "info" | "warning" | "error";

export interface LogEntry {
  /** ISO timestamp. */
  ts: string;
  level: LogLevel;
  message: string;
}

const buffer: LogEntry[] = [];

function push(level: LogLevel, args: unknown[]): void {
  buffer.push({
    ts: new Date().toISOString(),
    level,
    message: args.map(formatArg).join(" "),
  });
  // Drop oldest when over capacity. Single shift is O(n), but at this scale
  // (1000 entries, sporadic writes) it's negligible — measured the same as
  // splice in micro-benchmarks. Premature optimization avoided.
  while (buffer.length > MAX_ENTRIES) buffer.shift();
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/** Snapshot of the current buffer. Caller gets a copy; buffer keeps growing. */
export function listLogs(): LogEntry[] {
  return buffer.slice();
}

let installed = false;

/** Idempotent — safe to call multiple times. */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args: unknown[]) => {
    push("info", args);
    original.log(...(args as Parameters<typeof console.log>));
  };
  console.info = (...args: unknown[]) => {
    push("info", args);
    original.info(...(args as Parameters<typeof console.info>));
  };
  console.warn = (...args: unknown[]) => {
    push("warning", args);
    original.warn(...(args as Parameters<typeof console.warn>));
  };
  console.error = (...args: unknown[]) => {
    push("error", args);
    original.error(...(args as Parameters<typeof console.error>));
  };
}

// Install on module load so any console call from any other module is
// captured — even ones that fire during module initialization (e.g. the
// boot sequence in index.ts).
installLogCapture();
