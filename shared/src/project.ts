import { z } from "zod";

// Multi-project layer (added in v0.2.6). Each Bleepforge install can hold
// many projects; one is active at a time. The active project's slug picks
// which data dir the rest of the server reads + writes through, and which
// Godot project (if any) the .tres watcher + writer target.
//
// Three modes today:
//   - sync     two-way live sync with a Godot project's .tres files
//              (the only mode pre-v0.2.6; godotProjectRoot is required)
//   - notebook full feature parity, no Godot connection; assets + shaders
//              live inside the Bleepforge project's own content/ dir
//              (shipped in phase 5; placeholder in the schema from phase 1
//              so we don't have to bump schemaVersion mid-series)
//
// `slug` is immutable and used as the on-disk directory name under
// projects/<slug>/. URL-safe, lowercase, [a-z0-9-]+. Display name can be
// renamed freely without filesystem churn.

export const ProjectModeSchema = z.enum(["sync", "notebook"]);
export type ProjectMode = z.infer<typeof ProjectModeSchema>;

export const ProjectSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  displayName: z.string().min(1),
  mode: ProjectModeSchema,
  /** Absolute path to the Godot project. Required for sync mode, null
   *  for notebook mode. The server reads this once at boot through
   *  the active-project record; restart required to change. */
  godotProjectRoot: z.string().nullable(),
  createdAt: z.string(),
  lastOpened: z.string(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  projects: z.array(ProjectSchema),
});

export type ProjectRegistry = z.infer<typeof ProjectRegistrySchema>;

export const ActiveProjectPointerSchema = z.object({
  schemaVersion: z.literal(1),
  activeSlug: z.string().nullable(),
  lastSwitched: z.string(),
});

export type ActiveProjectPointer = z.infer<typeof ActiveProjectPointerSchema>;

/** Turn a free-form display name into a URL-safe slug.
 *  Lowercase, non-alphanumerics → hyphen, collapse + trim hyphens, cap
 *  at 60 chars. Empty result → `fallback`. */
export function slugify(input: string, fallback = "untitled"): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks left over from the NFKD decomposition so accented
    // letters collapse to their ASCII base ("café" → "cafe") instead of
    // turning into a hyphen.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
  return slug || fallback;
}
