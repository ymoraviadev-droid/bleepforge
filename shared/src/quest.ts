import { z } from "zod";

export const ObjectiveType = z.enum([
  "CollectItem",
  "ReachLocation",
  "TalkToNpc",
  "KillNpc",
  "KillEnemyType",
]);
export type ObjectiveType = z.infer<typeof ObjectiveType>;

export const RewardType = z.enum(["Item", "Flag", "Credits"]);
export type RewardType = z.infer<typeof RewardType>;

export const QuestObjectiveSchema = z.object({
  // Stable identity tag mirroring the Godot sub_resource id. Used by the
  // .tres mapper for reorder-safe matching. Distinct from the user-facing
  // `Id` field below (which Bleepforge surfaces as the per-quest objective key).
  _subId: z.string().optional(),
  Id: z.string().default(""),
  Description: z.string().default(""),
  Type: ObjectiveType.default("CollectItem"),
  TargetItem: z.string().default(""),
  TargetId: z.string().default(""),
  EnemyType: z.string().default(""),
  RequiredCount: z.number().int().default(1),
  ConsumeOnTurnIn: z.boolean().default(true),
});

export const QuestRewardSchema = z.object({
  _subId: z.string().optional(),
  Type: RewardType.default("Item"),
  Item: z.string().default(""),
  Quantity: z.number().int().default(1),
  FlagName: z.string().default(""),
  CreditAmount: z.number().int().default(0),
});

export const QuestSchema = z.object({
  Id: z.string().min(1),
  QuestGiverId: z.string().default(""),
  Title: z.string().default(""),
  Description: z.string().default(""),
  Objectives: z.array(QuestObjectiveSchema).default([]),
  Rewards: z.array(QuestRewardSchema).default([]),
  ActiveFlag: z.string().default(""),
  CompleteFlag: z.string().default(""),
  TurnedInFlag: z.string().default(""),
});

export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;
export type QuestReward = z.infer<typeof QuestRewardSchema>;
export type Quest = z.infer<typeof QuestSchema>;
