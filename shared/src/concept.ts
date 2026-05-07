import { z } from "zod";

// Bleepforge-only document. Holds the high-level "what is this game" info —
// title, art, pitch, status — as a single editable doc that doubles as the
// app's homepage. Not exported to Godot; lives at `data/concept.json`.
//
// Every field is optional — let the user fill what's useful and skip the rest.

export const ConceptSchema = z.object({
  Title: z.string().default(""),
  Tagline: z.string().default(""),
  Description: z.string().default(""),
  // Image asset paths (absolute filesystem paths, served via /api/asset).
  Logo: z.string().default(""),
  Icon: z.string().default(""),
  SplashImage: z.string().default(""),
  Genre: z.string().default(""),
  Setting: z.string().default(""),
  Status: z.string().default(""),
  Inspirations: z.string().default(""),
  Notes: z.string().default(""),
});

export type Concept = z.infer<typeof ConceptSchema>;

export const emptyConcept = (): Concept => ({
  Title: "",
  Tagline: "",
  Description: "",
  Logo: "",
  Icon: "",
  SplashImage: "",
  Genre: "",
  Setting: "",
  Status: "",
  Inspirations: "",
  Notes: "",
});
