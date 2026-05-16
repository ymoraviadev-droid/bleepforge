// Generic HTTP surface for manifest-declared domains.
//
// `GET /api/manifest-domain/:domain` returns both the manifest Entry
// declaration and the entities discovered for that domain. Each entity
// carries identity (id, absPath, resPath, scriptClass, folder) PLUS
// the user-authored field values read from the JSON cache that boot
// reconcile populates via the generic importer.
//
// v0.2.7 shipped this as identity-only (no field values — that was the
// generic importer's job in v0.2.8). v0.2.8 Phase 3 flips it to
// include values inline: a single fetch gives the client everything
// it needs to render a populated list. The JSON cache is the source
// of truth at request time so watcher-driven .tres edits propagate to
// the UI without a server restart (Phase 4 wires the watcher into the
// same generic path).
//
// 404 when the domain isn't declared in the manifest. FoB's hardcoded
// domains (item / quest / karma / faction / npc / dialog / balloon)
// are NOT served here — they have their own routers. Manifest-
// declared domains use names disjoint from those (FoB-wins partition;
// see projectIndex docs).

import { Router } from "express";
import { manifestCache } from "./cache.js";
import { listEntities } from "./storage.js";
import { projectIndex } from "../projectIndex/index.js";

export const manifestDomainRouter: Router = Router();

manifestDomainRouter.get("/", (_req, res) => {
  // Index: list every manifest-declared domain by name + kind +
  // discovered entity count. Lightweight enough for the client to
  // fetch on every nav.
  const domains = manifestCache.listDomains().map((entry) => ({
    domain: entry.domain,
    kind: entry.kind,
    class: kindClass(entry),
    view: entry.view,
    overrideUi: entry.overrideUi,
    displayName: "displayName" in entry ? entry.displayName ?? null : null,
    entityCount: projectIndex.list(entry.domain).length,
  }));
  res.json({ domains });
});

manifestDomainRouter.get("/:domain", async (req, res) => {
  const { domain } = req.params;
  const entry = manifestCache.getDomain(domain);
  if (!entry) {
    res.status(404).json({
      error: `domain "${domain}" not declared in the active manifest`,
    });
    return;
  }
  // Pre-read the JSON cache once and look up per-id during the
  // projectIndex walk. Avoids N filesystem reads in series while still
  // preserving projectIndex's stable insertion order on the response.
  const byId = new Map<string, Record<string, unknown>>();
  for (const e of await listEntities(entry)) byId.set(e.id, e.values);

  const entities = projectIndex.list(domain).map((e) => ({
    id: e.id,
    absPath: e.absPath,
    resPath: e.resPath,
    uid: e.uid,
    scriptClass: e.scriptClass,
    folder: e.folder,
    values: byId.get(e.id) ?? null,
  }));
  res.json({ entry, entities });
});

// Resolves the "class" field for index display. discriminatedFamily
// puts it on `base.class`; the other three put it at the top level.
function kindClass(entry: ReturnType<typeof manifestCache.getDomain>): string | null {
  if (!entry) return null;
  if (entry.kind === "discriminatedFamily") return entry.base.class;
  return entry.class;
}
