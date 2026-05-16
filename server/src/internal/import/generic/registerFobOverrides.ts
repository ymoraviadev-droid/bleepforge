// Module-init registration of the seven FoB-shaped importers as overrides
// against the unified read dispatcher.
//
// Importing this file once (from app.ts at boot) is enough; it has no
// exports and runs its side effects at module load. Mirrors the writer-
// side pattern at `../../tres/generic/registerFobOverrides.ts`.
//
// Per the (A) lock for the v0.2.6 → v0.3.0 arc: editor-side overrides are
// transitional. By v0.2.9 close they retire and Bleepforge core ships
// zero FoB-specific code. v0.2.8 keeps them alive so the byte-identical
// validation harness (Phase 5) has a known-good reference point to gate
// the generic path against.
//
// The boot reconcile orchestrator continues to call mappers directly in
// v0.2.8 — this registry is queried by single-file paths (watcher
// reimport in Phase 4) and by readers that want a uniform domain-keyed
// entry point. Phase 3 lights up the dispatch for manifest-discovered
// non-FoB domains.
//
// Cross-domain ref resolution (quest → item, npc → dialog + balloon)
// reads through ProjectIndex rather than the orchestrator's path→key
// maps. The maps remain in the orchestrator for the in-process passes
// (where they avoid the index round-trip during a tight boot loop);
// the override wrappers below use the index because they're invoked
// per-file from contexts that don't have a populated map handy
// (watcher reimport, future generic dispatch).

import path from "node:path";

import {
  BalloonSchema,
  FactionDataSchema,
  ItemSchema,
  KarmaImpactSchema,
  NpcSchema,
  QuestSchema,
  type DialogSequence,
} from "@bleepforge/shared";

import { projectIndex } from "../../../lib/projectIndex/index.js";
import {
  mapBalloon,
  mapDialogSequence,
  mapFaction,
  mapItem,
  mapKarma,
  mapNpc,
  mapQuest,
  resPathToAbs,
  type NpcImportContext,
  type QuestImportContext,
} from "../mappers.js";
import type { ParsedTres } from "../tresParser.js";
import { registerOverride, type ReadCtx } from "./overrideRegistry.js";
import type { TresReadResult } from "./types.js";

function ok(entity: unknown): TresReadResult {
  return { attempted: true, ok: true, entity };
}

function skip(scriptClass: string | undefined, expected: string): TresReadResult {
  return {
    attempted: true,
    ok: false,
    skipReason: `script_class is "${scriptClass ?? "?"}", not ${expected}`,
  };
}

function fail(error: string): TresReadResult {
  return { attempted: true, ok: false, error };
}

// ---- Simple sync mappers (no cross-domain context) ------------------------

registerOverride("item", (parsed, ctx) => {
  try {
    const entity = mapItem(parsed);
    if (!entity) return skip(parsed.scriptClass, "ItemData/QuestItemData");
    if (entity.Icon.startsWith("res://")) {
      entity.Icon = resPathToAbs(entity.Icon, ctx.godotRoot);
    }
    return ok(ItemSchema.parse(entity));
  } catch (err) {
    return fail((err as Error).message ?? String(err));
  }
});

registerOverride("karma", (parsed) => {
  try {
    const entity = mapKarma(parsed);
    if (!entity) return skip(parsed.scriptClass, "KarmaImpact");
    return ok(KarmaImpactSchema.parse(entity));
  } catch (err) {
    return fail((err as Error).message ?? String(err));
  }
});

registerOverride("faction", (parsed, ctx) => {
  try {
    const entity = mapFaction(parsed);
    if (!entity) return skip(parsed.scriptClass, "FactionData");
    if (entity.Icon.startsWith("res://")) {
      entity.Icon = resPathToAbs(entity.Icon, ctx.godotRoot);
    }
    if (entity.Banner.startsWith("res://")) {
      entity.Banner = resPathToAbs(entity.Banner, ctx.godotRoot);
    }
    return ok(FactionDataSchema.parse(entity));
  } catch (err) {
    return fail((err as Error).message ?? String(err));
  }
});

registerOverride("dialog", (parsed, ctx) => {
  try {
    const entity: DialogSequence | null = mapDialogSequence(parsed);
    if (!entity) return skip(parsed.scriptClass, "DialogSequence");
    for (const line of entity.Lines) {
      if (line.Portrait.startsWith("res://")) {
        line.Portrait = resPathToAbs(line.Portrait, ctx.godotRoot);
      }
    }
    return ok(entity);
  } catch (err) {
    return fail((err as Error).message ?? String(err));
  }
});

registerOverride("balloon", (parsed, ctx) => {
  try {
    const basename = path.basename(ctx.filePath, ".tres");
    const entity = mapBalloon(parsed, basename);
    if (!entity) return skip(parsed.scriptClass, "BalloonLine");
    return ok(BalloonSchema.parse(entity));
  } catch (err) {
    return fail((err as Error).message ?? String(err));
  }
});

// ---- Cross-domain mappers — resolve refs through ProjectIndex -------------

registerOverride("quest", (parsed, ctx) => {
  try {
    const importCtx: QuestImportContext = {
      resolveItemSlugByExtRef: (p: ParsedTres, extId: string) => {
        const ext = p.extResources.get(extId);
        if (!ext?.path) return null;
        const entry = projectIndex.getByResPath(ext.path);
        return entry && entry.domain === "item" ? entry.id : null;
      },
    };
    const entity = mapQuest(parsed, importCtx);
    if (!entity) return skip(parsed.scriptClass, "Quest");
    return ok(QuestSchema.parse(entity));
  } catch (err) {
    return fail((err as Error).message ?? String(err));
  }
});

registerOverride("npc", (parsed, ctx) => {
  try {
    const importCtx: NpcImportContext = {
      resolveDialogSequenceId: (p: ParsedTres, extId: string) => {
        const ext = p.extResources.get(extId);
        if (!ext?.path) return null;
        const entry = projectIndex.getByResPath(ext.path);
        return entry && entry.domain === "dialog" ? entry.id : null;
      },
      resolveBalloonId: (p: ParsedTres, extId: string) => {
        const ext = p.extResources.get(extId);
        if (!ext?.path) return null;
        const entry = projectIndex.getByResPath(ext.path);
        // Composite id "<folder>/<id>" — projectIndex stores the
        // composite already in entry.id for balloons.
        return entry && entry.domain === "balloon" ? entry.id : null;
      },
    };
    const entity = mapNpc(parsed, importCtx);
    if (!entity) return skip(parsed.scriptClass, "NpcData");
    if (entity.Portrait.startsWith("res://")) {
      entity.Portrait = resPathToAbs(entity.Portrait, ctx.godotRoot);
    }
    return ok(NpcSchema.parse(entity));
  } catch (err) {
    return fail((err as Error).message ?? String(err));
  }
});

// Re-export ReadCtx so the dispatcher's callers can type their ctx
// payloads without reaching into the registry module directly.
export type { ReadCtx };
