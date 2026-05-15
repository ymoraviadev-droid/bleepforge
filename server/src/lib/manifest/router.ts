// HTTP surface for the Bleepforge manifest. One read-only endpoint feeds
// the Diagnostics → Manifest tab.
//
// `GET /api/manifest` returns the four-state discriminated load result
// from loader.ts. The client renders different UIs per status:
//   - "ok"             → green badge, schema version, domain + sub-resource counts, per-domain table
//   - "missing"        → "no manifest detected" with a pointer at godot-lib install instructions
//   - "error"          → red badge, error message + per-issue list
//   - "not-applicable" → muted "this project isn't sync-mode" message
//
// No SSE; the tab refreshes on demand. The user clicks "Re-export Bleepforge
// manifest" in their Godot editor's Tools menu, then comes back here and
// clicks Refresh — that's the loop. Auto-watching the manifest file would
// be overkill for v0.2.6's diagnostic-only consumption; revisit if v0.2.7+
// drives generic surfaces directly off the manifest.

import { Router } from "express";

import { loadManifest } from "./loader.js";

export const manifestRouter: Router = Router();

manifestRouter.get("/", async (_req, res) => {
  const result = await loadManifest();
  res.json(result);
});
