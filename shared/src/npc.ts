import { z } from "zod";

// Schema for the Godot `NpcData : Resource`. Replaced the previous lightweight
// stub (`Description` / `Portraits[]` / `Sprites[]`) — those were minimally
// surfaced in the UI and lossy compared to the canonical `Portrait` from
// NpcData. See CLAUDE.md "Domain 6 — NPCs" for the design rationale.
//
// Sub-resource shapes:
// - NpcQuestEntry — the quest bridge (5 dialog refs per entry). Round-tripped
//   in v1 but not authored — Bleepforge surfaces it read-only on the form.
// - LootTable + LootEntry — round-tripped in v1, also not authored. PickupScene
//   stays as the original res:// path (PackedScene .tscn ref kept intact).

export const NpcQuestEntrySchema = z.object({
  // Stable identity tag mirroring the Godot sub_resource id, for reorder-safe
  // matching during write-back.
  _subId: z.string().optional(),
  QuestId: z.string().default(""),
  QuestActiveFlag: z.string().default(""),
  QuestTurnedInFlag: z.string().default(""),
  // Dialog refs, stored as DialogSequence Ids in JSON (resolved from the
  // ext-resource path during import, like QuestObjective.TargetItem → Slug).
  OfferDialog: z.string().default(""),
  AcceptedDialog: z.string().default(""),
  InProgressDialog: z.string().default(""),
  TurnInDialog: z.string().default(""),
  PostQuestDialog: z.string().default(""),
});

export const LootEntrySchema = z.object({
  _subId: z.string().optional(),
  // Original res:// path to a .tscn (PackedScene). Bleepforge doesn't author
  // these — kept as an opaque string so the round-trip preserves the ref.
  PickupScene: z.string().default(""),
  Chance: z.number().default(1.0),
  MinAmount: z.number().int().default(1),
  MaxAmount: z.number().int().default(1),
});

export const LootTableSchema = z.object({
  _subId: z.string().optional(),
  Entries: z.array(LootEntrySchema).default([]),
});

export const NpcSchema = z.object({
  // Identity
  NpcId: z.string().min(1),
  DisplayName: z.string().default(""),
  MemoryEntryId: z.string().default(""),
  Portrait: z.string().default(""),

  // Dialog & Quests
  DefaultDialog: z.string().default(""),
  OffendedDialog: z.string().default(""),
  OffendedFlag: z.string().default(""),
  Quests: z.array(NpcQuestEntrySchema).default([]),

  // Karma
  DeathImpactId: z.string().default(""),
  DeathImpactIdContextual: z.string().default(""),
  ContextualFlag: z.string().default(""),

  // Misc
  // LootTable is null when the NPC has no loot. When present it's an inline
  // sub-resource in the .tres.
  LootTable: LootTableSchema.nullable().default(null),
  // CasualRemark is an ext-resource path to a separate BalloonLine .tres.
  CasualRemark: z.string().default(""),
  DidSpeakFlag: z.string().default(""),
});

export type NpcQuestEntry = z.infer<typeof NpcQuestEntrySchema>;
export type LootEntry = z.infer<typeof LootEntrySchema>;
export type LootTable = z.infer<typeof LootTableSchema>;
export type Npc = z.infer<typeof NpcSchema>;
