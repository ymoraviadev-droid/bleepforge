// Domain -> override writer function map.
//
// Bleepforge's .tres writeback dispatches through a single entry point
// (writeTres in ./writer.ts). For every domain, the dispatcher first
// consults this registry. If an override is registered, it runs that;
// otherwise the dispatcher falls through to the generic manifest-driven
// mapper (v0.2.7+).
//
// In v0.2.7 the registry's job is to keep all seven FoB-shaped writers
// (item / karma / quest / npc / faction / dialog / balloon) operating
// unchanged while the generic mapper is built up commit-by-commit. Over
// the v0.2.7 cycle one of them (Karma) graduates to the generic path as
// the validation gate; the other six stay as overrides for the
// foreseeable future. Symmetric with the UI's `overrideUi` mechanism.
//
// Registration is module-init: see ./registerFobOverrides.ts.
//
// The registry is keyed by SyncDomain so the dispatcher can be wired
// from CRUD routers (which already carry a SyncDomain for the saves
// activity feed) without an additional discriminator.
//
// Folder-aware domains (dialog, balloon) thread the folder through
// `ctx.folder`. Non-folder domains ignore it.

import type { SyncDomain } from "../../../lib/sync/eventBus.js";
import type { TresWriteResult } from "../writer.js";

export interface WriteCtx {
  folder?: string;
}

export type OverrideWriter = (
  entity: unknown,
  ctx: WriteCtx,
) => Promise<TresWriteResult>;

const overrides = new Map<SyncDomain, OverrideWriter>();

export function registerOverride(
  domain: SyncDomain,
  fn: OverrideWriter,
): void {
  overrides.set(domain, fn);
}

export function getOverride(domain: SyncDomain): OverrideWriter | null {
  return overrides.get(domain) ?? null;
}

export function listOverriddenDomains(): SyncDomain[] {
  return [...overrides.keys()];
}
