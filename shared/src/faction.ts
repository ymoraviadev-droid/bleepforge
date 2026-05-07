import { z } from "zod";
import { Faction } from "./karma";

// FactionData mirrors Godot's `FactionData : Resource` (one per Faction enum
// value). The Faction enum stays in karma.ts (where it was first introduced
// for KarmaDelta.Faction) — this module just consumes it.

export const FactionDataSchema = z.object({
  Faction: Faction,
  DisplayName: z.string().default(""),
  // Resolved absolute paths (importer converts res:// → absolute). Bleepforge
  // serves them through /api/asset for live previews.
  Icon: z.string().default(""),
  Banner: z.string().default(""),
  ShortDescription: z.string().default(""),
});

export type FactionData = z.infer<typeof FactionDataSchema>;
