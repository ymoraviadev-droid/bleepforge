import { z } from "zod";

export const NpcSchema = z.object({
  NpcId: z.string().min(1),
  DisplayName: z.string().default(""),
  Description: z.string().default(""),
  Portraits: z.array(z.string()).default([]),
  Sprites: z.array(z.string()).default([]),
});

export type Npc = z.infer<typeof NpcSchema>;
