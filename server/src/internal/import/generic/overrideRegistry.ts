// Domain -> override reader function map.
//
// Symmetric with the writer-side registry at
// `../../tres/generic/overrideRegistry.ts`. The boot reconcile + watcher
// reimport dispatch through a single entry point (./reader.ts → readTres);
// for every domain the dispatcher first consults this registry, falls
// through to the generic manifest-driven importer if no override is
// registered.
//
// In v0.2.8 the registry's job is to keep FoB's seven hand-rolled
// importers (mapItem / mapKarma / mapQuest / mapNpc / mapFaction /
// mapDialogSequence / mapBalloon) operating unchanged while the generic
// reader is built up commit-by-commit. Over the v0.2.8 cycle, Karma
// graduates to the generic path as the byte-identical validation gate;
// other domains' retirement is a v0.2.9-cycle decision per the (A) lock
// (editor-side overrides retire by v0.2.9 close so Bleepforge core ships
// zero FoB-specific code in v0.3.0).
//
// Registration is module-init: see ./registerFobOverrides.ts.
//
// Folder-aware domains (dialog, balloon) thread the folder through
// `ctx.folder`. Non-folder domains ignore it.

import type { SyncDomain } from "../../../lib/sync/eventBus.js";
import type { ParsedTres } from "../tresParser.js";
import type { TresReadResult } from "./types.js";

export interface ReadCtx {
  filePath: string;
  godotRoot: string;
  folder?: string;
}

export type OverrideReader = (
  parsed: ParsedTres,
  ctx: ReadCtx,
) => Promise<TresReadResult> | TresReadResult;

const overrides = new Map<SyncDomain, OverrideReader>();

export function registerOverride(
  domain: SyncDomain,
  fn: OverrideReader,
): void {
  overrides.set(domain, fn);
}

export function getOverride(domain: SyncDomain): OverrideReader | null {
  return overrides.get(domain) ?? null;
}

export function listOverriddenDomains(): SyncDomain[] {
  return [...overrides.keys()];
}
