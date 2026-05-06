import { z } from "zod";

export const ItemCategory = z.enum([
  "Misc",
  "Weapon",
  "QuestItem",
  "Upgrade",
  "Consumable",
]);
export type ItemCategory = z.infer<typeof ItemCategory>;

export const ItemSchema = z.object({
  Slug: z.string().min(1),
  DisplayName: z.string().default(""),
  Description: z.string().default(""),
  Icon: z.string().default(""),
  IsStackable: z.boolean().default(true),
  MaxStack: z.number().int().default(99),
  Price: z.number().int().default(0),
  Category: ItemCategory.default("Misc"),
  QuestId: z.string().default(""),
  CanDrop: z.boolean().default(false),
});

export type Item = z.infer<typeof ItemSchema>;
