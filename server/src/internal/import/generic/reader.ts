// Unified .tres → JSON import entry point — the single funnel that every
// per-file reader path goes through. Replaces direct mapXxx callsites
// (those functions still exist and run the actual work; they're now
// wrapped as overrides in ./registerFobOverrides.ts).
//
// Dispatch order:
//   1. Check the override registry. FoB's hand-tuned importers live here
//      throughout v0.2.8; per the (A) lock they retire by v0.2.9 close.
//   2. If no override, fall through to the generic manifest-driven
//      reader. In v0.2.8 commit #1 this is a no-op (returns
//      readNotAttempted); subsequent commits flesh out the generic path
//      with scalar / ref / texture / array / subresource handlers.
//
// Symmetric with `../../tres/generic/writer.ts`. The dispatcher itself
// stays domain-agnostic — adding a new domain means either registering
// an override or declaring it in the manifest, not editing this file.

import type { SyncDomain } from "../../../lib/sync/eventBus.js";
import type { ParsedTres } from "../tresParser.js";
import { getOverride, type ReadCtx } from "./overrideRegistry.js";
import { readNotAttempted, type TresReadResult } from "./types.js";

export type { ReadCtx } from "./overrideRegistry.js";
export { readNotAttempted, type TresReadResult } from "./types.js";

export async function readTres(
  domain: SyncDomain,
  parsed: ParsedTres,
  ctx: ReadCtx,
): Promise<TresReadResult> {
  const override = getOverride(domain);
  if (override) return override(parsed, ctx);

  // Generic path not yet wired (v0.2.8 commit #2+). Domains without an
  // override produce a clean no-attempt result so the caller (boot
  // reconcile / watcher reimport) records an honest "no read happened"
  // rather than fabricating success.
  return readNotAttempted();
}
