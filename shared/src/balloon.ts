import { z } from "zod";

// Mirrors the Godot `BalloonLine : Resource` (shared/components/balloon/BalloonLine.cs).
// Three authored fields — Text + the two animation knobs — and that's the
// whole resource. No sub-resources, no enums, no FK references in the
// resource itself.
//
// `Id` is a Bleepforge-only synthetic field: it's the .tres filename basename
// (e.g. "eddie_greetings"), used as the JSON cache filename and as the
// Bleepforge-id form ("<folder>/<Id>") that NpcData.CasualRemark stores.
// Godot's BalloonLine has no Id property, so the writer never emits it back
// to the .tres — the importer derives it from the filename on read.
//
// Storage on disk: data/balloons/<folder>/<Id>.json, where <folder> is the
// NPC robot model (e.g. "hap_500", "sld_300") that owns this balloon.
// Godot's convention is `characters/npcs/<model>/balloons/<basename>.tres`,
// and we group by parent-dir basename of `balloons/` — same auto-discovery
// trick the dialogs domain uses.

export const BalloonSchema = z.object({
  Id: z.string().min(1),
  Text: z.string().default(""),
  // chars/sec; 0 = instant. Godot default: 30.
  TypeSpeed: z.number().default(30),
  // seconds visible after typing finishes. Godot default: 2.0.
  HoldDuration: z.number().default(2.0),
});

export type Balloon = z.infer<typeof BalloonSchema>;
