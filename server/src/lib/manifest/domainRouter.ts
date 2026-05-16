// Generic HTTP surface for manifest-declared domains.
//
// `GET /api/manifest-domain/:domain` returns both the manifest Entry
// declaration and the IndexedTres entries discovered for that domain.
// The client uses the entry to know how to render (field types, view,
// fieldOrder) and the entries to populate the list.
//
// Identity-only result: v0.2.7's read-only MVP intentionally doesn't
// extract user-authored field VALUES from each .tres (that's the
// generic importer's job in v0.2.8). Each returned entity carries
// identity (id, absPath, resPath, scriptClass, folder) — enough to
// display a populated list and link each row to the .tres file.
// Building a list of "yes I see your Notes domain has these N entries"
// is the proof-of-discovery for v0.2.7; reading field values comes
// next cycle.
//
// 404 when the domain isn't declared in the manifest. FoB's hardcoded
// domains (item / quest / karma / faction / npc / dialog / balloon)
// are NOT served here — they have their own routers. Manifest-
// declared domains use names disjoint from those (FoB-wins partition;
// see projectIndex docs).

import { Router } from "express";
import { manifestCache } from "./cache.js";
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

manifestDomainRouter.get("/:domain", (req, res) => {
  const { domain } = req.params;
  const entry = manifestCache.getDomain(domain);
  if (!entry) {
    res.status(404).json({
      error: `domain "${domain}" not declared in the active manifest`,
    });
    return;
  }
  const entities = projectIndex.list(domain).map((e) => ({
    id: e.id,
    absPath: e.absPath,
    resPath: e.resPath,
    uid: e.uid,
    scriptClass: e.scriptClass,
    folder: e.folder,
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
