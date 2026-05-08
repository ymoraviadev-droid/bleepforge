// Walks the Godot project once at boot and buckets every .tres by what it
// is. Replaces the hardcoded folder lists in orchestrator.ts: new NPCs /
// new content folders just appear automatically without code changes (the
// previous papercut was that adding an NPC required editing
// KNOWN_DIALOG_FOLDERS).
//
// Detection rules:
//   - Quest / KarmaImpact / FactionData / NpcData / DialogSequence — bucketed
//     by script_class (each is a single C# class, no subclasses we author).
//   - Items — bucketed by `Slug = "..."` presence rather than script_class,
//     because mapItem accepts any subclass of ItemData (MedkitData, WeaponData,
//     etc.) and dropping subclasses by name would silently lose them on every
//     new C# class. Slug is item-exclusive in this corpus — quests/karma/etc.
//     use Id, not Slug.
//
// We read the full file rather than just the header. Files are tiny
// (~1 KB each, ~90 KB total for the project) and full reads remove any
// "did I read enough bytes for the marker to appear?" fragility.

import fs from "node:fs/promises";
import path from "node:path";

export interface Discovery {
  items: string[];
  quests: string[];
  karma: string[];
  factions: string[];
  npcs: string[];
  /** Bleepforge folder name (parent dir basename) → DialogSequence .tres paths. */
  dialogs: Map<string, string[]>;
  /** Bleepforge folder name (NPC model — grandparent dir of the .tres) →
   *  BalloonLine .tres paths. The convention is
   *  `characters/npcs/<model>/balloons/<basename>.tres`, so the immediate
   *  parent must be named "balloons" for the file to qualify. */
  balloons: Map<string, string[]>;
}

const SCRIPT_CLASS_RE = /script_class="([^"]+)"/;
const SLUG_RE = /^\s*Slug\s*=\s*"/m;

interface FileSummary {
  scriptClass: string | null;
  hasSlug: boolean;
}

async function summarize(absPath: string): Promise<FileSummary | null> {
  try {
    const text = await fs.readFile(absPath, "utf8");
    const m = SCRIPT_CLASS_RE.exec(text);
    return {
      scriptClass: m && m[1] ? m[1] : null,
      hasSlug: SLUG_RE.test(text),
    };
  } catch {
    return null;
  }
}

export async function discoverGodotContent(godotRoot: string): Promise<Discovery> {
  const out: Discovery = {
    items: [],
    quests: [],
    karma: [],
    factions: [],
    npcs: [],
    dialogs: new Map(),
    balloons: new Map(),
  };

  await walk(godotRoot, out);
  return out;
}

async function walk(dir: string, out: Discovery): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    // Skip dot-dirs (.godot cache, .git, .import) and hidden files. The
    // .godot/ cache holds Godot-generated .tres files we never want.
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!e.isFile() || !e.name.endsWith(".tres")) continue;

    const summary = await summarize(full);
    if (!summary) continue;

    switch (summary.scriptClass) {
      case "Quest":
        out.quests.push(full);
        continue;
      case "KarmaImpact":
        out.karma.push(full);
        continue;
      case "FactionData":
        out.factions.push(full);
        continue;
      case "NpcData":
        out.npcs.push(full);
        continue;
      case "DialogSequence": {
        // Convention: .tres lives at .../dialogs/<folder>/<id>.tres, so the
        // parent directory's basename is the Bleepforge folder name (matches
        // the speaker context — "Eddie", "Krang", "welcome", etc.).
        const folder = path.basename(path.dirname(full));
        const list = out.dialogs.get(folder) ?? [];
        list.push(full);
        out.dialogs.set(folder, list);
        continue;
      }
      case "BalloonLine": {
        // Convention: .tres lives at characters/npcs/<model>/balloons/<basename>.tres.
        // Group by <model> (the grandparent dir). Skip files outside that
        // convention so we don't accidentally bucket unrelated BalloonLines
        // (defensive — the corpus only has the convention today).
        const parentDir = path.dirname(full);
        if (path.basename(parentDir) !== "balloons") continue;
        const folder = path.basename(path.dirname(parentDir));
        const list = out.balloons.get(folder) ?? [];
        list.push(full);
        out.balloons.set(folder, list);
        continue;
      }
    }

    // Items: any resource with a Slug field. Catches ItemData, QuestItemData,
    // and any subclass (MedkitData, WeaponData, …) without needing a class
    // allowlist that goes stale every time a new C# subclass is added.
    if (summary.hasSlug) {
      out.items.push(full);
      continue;
    }

    // Anything else (BalloonLine, inline LootTable, etc.) is intentionally
    // ignored — not bucketed, not surfaced. Add a case above if a new domain
    // ever needs authoring.
  }
}
