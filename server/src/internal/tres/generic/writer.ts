// Unified .tres writeback entry point — the single funnel that every
// HTTP save path goes through. Replaces the per-domain `writeXxxTres`
// callsites (those functions still exist and run the actual work;
// they're now wrapped as overrides in ./registerFobOverrides.ts).
//
// Dispatch order:
//   1. Check the override registry. FoB's hand-tuned writers live here
//      throughout v0.2.7+ and stay correct without manifest involvement.
//   2. If no override, fall through to the generic manifest-driven
//      mapper. In v0.2.7 commit #1 this is a no-op (returns
//      NOT_ATTEMPTED); subsequent commits flesh out the generic path
//      with scalar / ref / texture / array / subresource handlers.
//
// The dispatcher itself stays domain-agnostic — adding a new domain
// means either registering an override or declaring it in the manifest,
// not editing this file.

import type { SyncDomain } from "../../../lib/sync/eventBus.js";
import { tresNotAttempted, type TresWriteResult } from "../writer.js";
import { getOverride, type WriteCtx } from "./overrideRegistry.js";

export type { WriteCtx } from "./overrideRegistry.js";

export async function writeTres(
  domain: SyncDomain,
  entity: unknown,
  ctx: WriteCtx = {},
): Promise<TresWriteResult> {
  const override = getOverride(domain);
  if (override) return override(entity, ctx);

  // Generic path not yet wired (v0.2.7 commit #2+). Domains without an
  // override produce a clean no-attempt result so the CRUD router records
  // an honest "no writeback happened" rather than fabricating success.
  return tresNotAttempted();
}
