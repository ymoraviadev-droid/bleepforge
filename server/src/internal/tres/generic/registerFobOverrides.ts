// Module-init registration of the seven FoB-shaped writers as overrides
// against the unified dispatcher.
//
// Importing this file once (from app.ts at boot) is enough; it has no
// exports and runs its side effects at module load. The pattern is
// deliberate — registration is a one-time wiring concern, not something
// runtime code needs to re-trigger.
//
// Per the v0.2.7 spec, six of these seven stay as overrides indefinitely;
// Karma is the migration target for commit #6 (override removed once the
// generic mapper produces byte-identical writeback). Future migrations
// (Quest, NPC, etc.) are v0.3.0+ decisions; this file is the single point
// of edit for "is FoB's <domain> served by an override or the generic
// path?"
//
// Folder-aware domains (dialog, balloon) unwrap ctx.folder. Treating an
// absent folder as an error rather than guessing — the dispatcher is
// called from folder-aware routers (balloon, dialog) which always set
// it; if it's missing, something upstream is broken and we want to know.

import type {
  Balloon,
  DialogSequence,
  FactionData,
  Item,
  KarmaImpact,
  Npc,
  Quest,
} from "@bleepforge/shared";

import {
  writeBalloonTres,
  writeDialogTres,
  writeFactionTres,
  writeItemTres,
  writeKarmaTres,
  writeNpcTres,
  writeQuestTres,
} from "../writer.js";
import { registerOverride } from "./overrideRegistry.js";

registerOverride("item", (entity) => writeItemTres(entity as Item));
registerOverride("karma", (entity) => writeKarmaTres(entity as KarmaImpact));
registerOverride("quest", (entity) => writeQuestTres(entity as Quest));
registerOverride("npc", (entity) => writeNpcTres(entity as Npc));
registerOverride("faction", (entity) => writeFactionTres(entity as FactionData));

registerOverride("dialog", (entity, ctx) => {
  if (!ctx.folder) {
    return Promise.resolve({
      attempted: true,
      ok: false,
      error: "dialog writeback requires ctx.folder",
    });
  }
  return writeDialogTres(ctx.folder, entity as DialogSequence);
});

registerOverride("balloon", (entity, ctx) => {
  if (!ctx.folder) {
    return Promise.resolve({
      attempted: true,
      ok: false,
      error: "balloon writeback requires ctx.folder",
    });
  }
  return writeBalloonTres(ctx.folder, entity as Balloon);
});
