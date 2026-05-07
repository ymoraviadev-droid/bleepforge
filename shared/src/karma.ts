import { z } from "zod";

export const Faction = z.enum(["Scavengers", "FreeRobots", "RFF", "Grove"]);
export type Faction = z.infer<typeof Faction>;

export const KarmaDeltaSchema = z.object({
  // Stable identity tag (e.g. "Resource_puxjg"). See DialogLineSchema for shape.
  _subId: z.string().optional(),
  Faction: Faction.default("Scavengers"),
  Amount: z.number().int().default(0),
});

export const KarmaImpactSchema = z.object({
  Id: z.string().min(1),
  Description: z.string().default(""),
  Deltas: z.array(KarmaDeltaSchema).default([]),
});

export type KarmaDelta = z.infer<typeof KarmaDeltaSchema>;
export type KarmaImpact = z.infer<typeof KarmaImpactSchema>;
