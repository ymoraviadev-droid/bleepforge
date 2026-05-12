// Cross-system reference helpers shared by the two surfaces that scan the
// Godot project for references: assets/usages.ts (images) and
// shaders/usages.ts (.gdshader). Both answer "where is this resource used
// across .tres / .tscn / Bleepforge JSON?" and both want to map a matching
// .tres back to the Bleepforge edit page for the entity that owns it.
//
// Lives in lib/refScan/ rather than getting duplicated into each surface
// because detectTresDomainAndKey knows about every authored game-domain
// schema (script_class → which form to open) — duplicating that means two
// places to fix when a new domain lands. The other helpers (walkGodotRefs,
// pickLine, absoluteToResPath, safeRead) are trivial but co-located here
// for symmetry, so a third caller never has to hunt for them.

import fs from "node:fs/promises";
import path from "node:path";

export type UsageDomain =
  | "item"
  | "karma"
  | "quest"
  | "dialog"
  | "npc"
  | "faction"
  | "balloon"
  | "concept";

export interface UsageRef {
  /** Where this reference appears:
   *  - "tres": Godot resource file (Item / Quest / Faction / Npc / ...).
   *  - "tscn": Godot scene file (level, character scene, etc.).
   *  - "json": Bleepforge-only doc with no .tres counterpart (currently
   *            just data/concept.json). The per-domain JSON cache
   *            (data/npcs/, data/items/, ...) is NOT scanned by either
   *            consumer — those mirror their backing .tres 1:1 and would
   *            double-count every match the .tres scan already produced.
   */
  kind: "tres" | "tscn" | "json";
  /** Bleepforge-shaped domain so the client can build a link back. Scene
   *  refs (.tscn) don't map to a Bleepforge edit page (we don't author
   *  scenes here), so domain stays null and the file path is the
   *  meaningful info. */
  domain: UsageDomain | null;
  /** Routing key — primary id, or "<folder>/<id>" for folder-aware domains. */
  key: string | null;
  /** Absolute file path of the .tres / .tscn / JSON file. */
  file: string;
  /** Short context snippet for display. */
  snippet: string;
}

export async function safeRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export function pickLine(text: string, needle: string): string {
  const idx = text.indexOf(needle);
  if (idx < 0) return needle;
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  const lineEnd = text.indexOf("\n", idx);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  // Cap length so the UI doesn't get a 400-char dump on big lines.
  return line.length > 160 ? line.slice(0, 157) + "…" : line;
}

export function absoluteToResPath(absPath: string, godotRoot: string): string | null {
  const rel = path.relative(godotRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `res://${rel.replaceAll(path.sep, "/")}`;
}

export async function walkGodotRefs(
  dir: string,
  onFile: (full: string) => Promise<void>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkGodotRefs(full, onFile);
    } else if (
      e.isFile() &&
      (e.name.endsWith(".tres") || e.name.endsWith(".tscn"))
    ) {
      await onFile(full);
    }
  }
}

// Scenes don't map to a Bleepforge editor — we don't author .tscn here.
// Return a useful key for the UI (file basename, no extension) so the
// usages drawer still has something to display, with domain=null.
export function sceneFakeDomain(
  scenePath: string,
  godotRoot: string,
): { domain: null; key: string } {
  const rel = path.relative(godotRoot, scenePath);
  return { domain: null, key: rel.replace(/\.tscn$/, "") };
}

// Domain detection from a .tres path. We don't need a perfect match for
// every authored type — the existing import/discover.ts is the source of
// truth, but for the usages drawer's "where is this used" link we just
// need good enough heuristics to land on the right edit page. Reads the
// file header to pick up Slug / Id; falls back to filename basename.
export async function detectTresDomainAndKey(
  tresPath: string,
  godotRoot: string,
): Promise<{ domain: UsageDomain | null; key: string | null }> {
  void godotRoot; // reserved for future use; signature kept for callers
  const text = await safeRead(tresPath);
  if (!text) return { domain: null, key: null };
  const scriptClass = /script_class="([^"]+)"/.exec(text)?.[1] ?? null;
  const slug = /^\s*Slug\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const idMatch = /^\s*Id\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const npcId = /^\s*NpcId\s*=\s*"([^"]+)"/m.exec(text)?.[1];

  switch (scriptClass) {
    case "Quest":
      return { domain: "quest", key: idMatch ?? basenameNoExt(tresPath) };
    case "KarmaImpact":
      return { domain: "karma", key: idMatch ?? basenameNoExt(tresPath) };
    case "FactionData": {
      const factionInt = /^\s*Faction\s*=\s*(\d+)/m.exec(text)?.[1];
      const name = factionFromInt(factionInt);
      return { domain: "faction", key: name };
    }
    case "NpcData":
      return { domain: "npc", key: npcId ?? basenameNoExt(tresPath) };
    case "DialogSequence": {
      const folder = path.basename(path.dirname(tresPath));
      return { domain: "dialog", key: `${folder}/${idMatch ?? basenameNoExt(tresPath)}` };
    }
    case "BalloonLine": {
      // Convention: characters/npcs/<model>/balloons/<basename>.tres.
      const parent = path.dirname(tresPath);
      if (path.basename(parent) === "balloons") {
        const folder = path.basename(path.dirname(parent));
        return { domain: "balloon", key: `${folder}/${basenameNoExt(tresPath)}` };
      }
      return { domain: "balloon", key: null };
    }
    default:
      if (slug) return { domain: "item", key: slug };
      return { domain: null, key: null };
  }
}

export function basenameNoExt(p: string): string {
  const base = path.basename(p);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}

function factionFromInt(raw: string | undefined): string | null {
  // Mirrors FACTION_BY_INDEX in the existing importer. Kept inline because
  // the lookup is 4 rows; pulling the importer's export in would create a
  // round-trip dependency between lib/refScan and internal/import.
  switch (raw) {
    case "0":
      return "Scavengers";
    case "1":
      return "FreeRobots";
    case "2":
      return "RFF";
    case "3":
      return "Grove";
    default:
      return null;
  }
}
