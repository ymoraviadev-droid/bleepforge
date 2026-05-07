import { z } from "zod";

export const DialogChoiceSchema = z.object({
  // Stable identity tag mirroring the Godot sub_resource id (e.g. "Resource_io7sv").
  // Populated by the importer; preserved through edits; absence means "new
  // entry, mint a fresh sub_resource on save."
  _subId: z.string().optional(),
  Text: z.string().default(""),
  NextSequenceId: z.string().default(""),
  SetsFlag: z.string().default(""),
});

export const DialogLineSchema = z.object({
  _subId: z.string().optional(),
  SpeakerName: z.string().default(""),
  Text: z.string().default(""),
  Portrait: z.string().default(""),
  Choices: z.array(DialogChoiceSchema).default([]),
});

export const DialogSequenceSchema = z.object({
  Id: z.string().min(1),
  Lines: z.array(DialogLineSchema).default([]),
  SetsFlag: z.string().default(""),
});

export type DialogChoice = z.infer<typeof DialogChoiceSchema>;
export type DialogLine = z.infer<typeof DialogLineSchema>;
export type DialogSequence = z.infer<typeof DialogSequenceSchema>;
