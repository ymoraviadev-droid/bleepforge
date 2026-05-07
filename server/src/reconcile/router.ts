// Holds the last boot-time reconcile result and exposes it at
// `GET /api/reconcile/status`. The client polls this once on mount to
// surface "1 file failed to import" signals in the header — without it,
// a malformed .tres or a parser regression silently leaves one domain
// with stale JSON and the UI gives no indication.
//
// Boot reconcile is the only writer right now. Live-watcher single-file
// failures don't update this — they have different semantics (transient,
// per-file) and are logged separately. If we ever want to expose those
// too, this module is the right home for the aggregate state.

import { Router } from "express";

export interface DomainCounts {
  imported: number;
  skipped: number;
  errors: number;
}

export interface ReconcileStatus {
  ranAt: string; // ISO timestamp
  durationMs: number;
  /** False only when runImport itself threw (project root bad / inaccessible).
   *  Per-file errors don't flip this — they're collected in errorDetails. */
  ok: boolean;
  perDomain: Record<
    "items" | "quests" | "karma" | "factions" | "dialogs" | "npcs",
    DomainCounts
  >;
  errorDetails: { domain: string; file: string; error: string }[];
  skippedDetails: { domain: string; file: string; reason: string }[];
  /** When ok=false, the top-level error message. */
  error?: string;
}

let lastStatus: ReconcileStatus | null = null;

export function setReconcileStatus(s: ReconcileStatus): void {
  lastStatus = s;
}

export const reconcileRouter: Router = Router();

reconcileRouter.get("/status", (_req, res) => {
  res.json(lastStatus);
});
