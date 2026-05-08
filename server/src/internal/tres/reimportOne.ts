// Per-file re-import: given an absolute path to a .tres in the Godot
// project, detect its domain, parse, run the matching import mapper, and
// overwrite Bleepforge's JSON. Used by the watcher to keep JSON in sync
// when the .tres is edited externally.

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname, sep } from "node:path";

import { folderAbs } from "../../config.js";
import { parseTres } from "./parser.js";
import {
  mapBalloon,
  mapDialogSequence,
  mapFaction,
  mapItem,
  mapKarma,
  mapNpc,
  mapQuest,
} from "../import/mappers.js";
import type { ParsedTres } from "../import/tresParser.js";
// Import the lossy parser used by the import path. We use it because the
// import mappers consume its TresValue shape, not the round-trip parser's
// raw spans.
import { parseTres as parseTresLossy } from "../import/tresParser.js";
import type { SyncDomain } from "../../lib/sync/eventBus.js";

export interface ReimportResult {
  ok: boolean;
  domain?: SyncDomain;
  key?: string;
  jsonPath?: string;
  error?: string;
}

// Determines the domain from a .tres path. Returns null if the path doesn't
// match any authored domain (e.g. NPC scenes, internal scripts, etc.).
export function detectDomain(absPath: string): {
  domain: SyncDomain;
  key: string;
} | null {
  // Items: shared/items/data/<slug>.tres
  const itemMatch = absPath.match(/[/\\]shared[/\\]items[/\\]data[/\\]([^/\\]+)\.tres$/);
  if (itemMatch) return { domain: "item", key: itemMatch[1]! };

  // Karma: shared/components/karma/impacts/<id>.tres
  const karmaMatch = absPath.match(
    /[/\\]shared[/\\]components[/\\]karma[/\\]impacts[/\\]([^/\\]+)\.tres$/,
  );
  if (karmaMatch) return { domain: "karma", key: karmaMatch[1]! };

  // Factions: shared/components/factions/<subfolder>/<file>.tres — there's
  // exactly one .tres per faction subfolder. The key (Faction enum value)
  // isn't recoverable from the path; the watcher's reimport flow re-parses
  // the file to get it. We tag with a placeholder key here that gets replaced
  // by the actual Faction enum value once the file is parsed.
  const factionMatch = absPath.match(
    /[/\\]shared[/\\]components[/\\]factions[/\\]([^/\\]+)[/\\]([^/\\]+)\.tres$/,
  );
  if (factionMatch) return { domain: "faction", key: factionMatch[1]! };

  // Quests: shared/components/quest/quests/<id>.tres
  const questMatch = absPath.match(
    /[/\\]shared[/\\]components[/\\]quest[/\\]quests[/\\]([^/\\]+)\.tres$/,
  );
  if (questMatch) return { domain: "quest", key: questMatch[1]! };

  // Dialogs: */dialogs/<folder>/<id>.tres
  const dialogMatch = absPath.match(/[/\\]dialogs[/\\]([^/\\]+)[/\\]([^/\\]+)\.tres$/);
  if (dialogMatch) {
    return { domain: "dialog", key: `${dialogMatch[1]}/${dialogMatch[2]}` };
  }

  // NPCs: characters/npcs/<model>/data/<file>.tres — file basename is not
  // necessarily the NpcId (e.g. eddie_npc_data.tres → NpcId="eddie"), so we
  // tag with the basename here and let the reimport flow re-parse to recover
  // the actual NpcId.
  const npcMatch = absPath.match(
    /[/\\]characters[/\\]npcs[/\\]([^/\\]+)[/\\]data[/\\]([^/\\]+)\.tres$/,
  );
  if (npcMatch) return { domain: "npc", key: npcMatch[2]! };

  // Balloons: characters/npcs/<model>/balloons/<basename>.tres. Key is the
  // composite Bleepforge id "<model>/<basename>" — same scheme as dialogs.
  const balloonMatch = absPath.match(
    /[/\\]characters[/\\]npcs[/\\]([^/\\]+)[/\\]balloons[/\\]([^/\\]+)\.tres$/,
  );
  if (balloonMatch) {
    return { domain: "balloon", key: `${balloonMatch[1]}/${balloonMatch[2]}` };
  }

  return null;
}

export async function reimportOne(absPath: string): Promise<ReimportResult> {
  const detected = detectDomain(absPath);
  if (!detected) return { ok: false, error: "path doesn't match any authored domain" };

  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch (err) {
    return { ok: false, error: `read failed: ${(err as Error).message}` };
  }

  let parsed: ParsedTres;
  try {
    parsed = parseTresLossy(text);
  } catch (err) {
    return { ok: false, error: `parse failed: ${(err as Error).message}` };
  }

  switch (detected.domain) {
    case "item": {
      const item = mapItem(parsed);
      if (!item) return { ok: false, error: "mapItem returned null (no Slug?)" };
      const jsonPath = `${folderAbs.item}${sep}${item.Slug}.json`;
      await writeJson(jsonPath, item);
      return { ok: true, domain: "item", key: item.Slug, jsonPath };
    }
    case "karma": {
      const karma = mapKarma(parsed);
      if (!karma) return { ok: false, error: "mapKarma returned null (script_class mismatch?)" };
      const jsonPath = `${folderAbs.karma}${sep}${karma.Id}.json`;
      await writeJson(jsonPath, karma);
      return { ok: true, domain: "karma", key: karma.Id, jsonPath };
    }
    case "faction": {
      const faction = mapFaction(parsed);
      if (!faction) {
        return { ok: false, error: "mapFaction returned null (script_class mismatch?)" };
      }
      const jsonPath = `${folderAbs.faction}${sep}${faction.Faction}.json`;
      await writeJson(jsonPath, faction);
      return { ok: true, domain: "faction", key: faction.Faction, jsonPath };
    }
    case "npc": {
      // Single-file watcher path: no global dialog map. Use the
      // filename-as-Id heuristic, matching the convention used by Bleepforge's
      // own `data/dialogs/<folder>/<id>.json` storage and seen consistently in
      // the Godot project (eddie_intro.tres → "eddie_intro"). Falls back to
      // empty string if no match — JSON keeps it as "" rather than failing.
      const npc = mapNpc(parsed, {
        resolveDialogSequenceId: (p, id) => {
          const ext = p.extResources.get(id);
          if (!ext) return null;
          const m = ext.path.match(/[/\\]([^/\\]+)\.tres$/);
          return m ? m[1]! : null;
        },
      });
      if (!npc) return { ok: false, error: "mapNpc returned null" };
      const jsonPath = `${folderAbs.npc}${sep}${npc.NpcId}.json`;
      await writeJson(jsonPath, npc);
      return { ok: true, domain: "npc", key: npc.NpcId, jsonPath };
    }
    case "quest": {
      const quest = mapQuest(parsed, {
        resolveItemSlugByExtRef: (p, id) => {
          const ext = p.extResources.get(id);
          if (!ext) return null;
          // res://shared/items/data/<slug>.tres -> <slug>
          const m = ext.path.match(/[/\\]shared[/\\]items[/\\]data[/\\]([^/\\]+)\.tres$/);
          return m ? m[1]! : null;
        },
      });
      if (!quest) return { ok: false, error: "mapQuest returned null" };
      const jsonPath = `${folderAbs.quest}${sep}${quest.Id}.json`;
      await writeJson(jsonPath, quest);
      return { ok: true, domain: "quest", key: quest.Id, jsonPath };
    }
    case "dialog": {
      const dialog = mapDialogSequence(parsed);
      if (!dialog) return { ok: false, error: "mapDialogSequence returned null" };
      const [folder] = detected.key.split("/");
      const jsonPath = `${folderAbs.dialog}${sep}${folder}${sep}${dialog.Id}.json`;
      await writeJson(jsonPath, dialog);
      return { ok: true, domain: "dialog", key: detected.key, jsonPath };
    }
    case "balloon": {
      const [folder, basename] = detected.key.split("/");
      if (!folder || !basename) {
        return { ok: false, error: "malformed balloon key" };
      }
      const balloon = mapBalloon(parsed, basename);
      if (!balloon) return { ok: false, error: "mapBalloon returned null" };
      const jsonPath = `${folderAbs.balloon}${sep}${folder}${sep}${balloon.Id}.json`;
      await writeJson(jsonPath, balloon);
      return { ok: true, domain: "balloon", key: detected.key, jsonPath };
    }
    default:
      return { ok: false, error: `unhandled domain ${detected.domain}` };
  }
}

// Watch event for a deleted .tres: remove the corresponding JSON.
export async function deleteJsonFor(absPath: string): Promise<ReimportResult> {
  const detected = detectDomain(absPath);
  if (!detected) return { ok: false, error: "path doesn't match any authored domain" };
  let jsonPath: string;
  switch (detected.domain) {
    case "item":
      jsonPath = `${folderAbs.item}${sep}${detected.key}.json`;
      break;
    case "karma":
      jsonPath = `${folderAbs.karma}${sep}${detected.key}.json`;
      break;
    case "faction": {
      // detected.key is the subfolder name; map it to the Faction enum value.
      // Robotek has no enum entry (lore-only) so it has no JSON to delete.
      const SUBFOLDER_TO_FACTION: Record<string, string> = {
        scavengers: "Scavengers",
        free_robots: "FreeRobots",
        rff: "RFF",
        grove: "Grove",
      };
      const factionKey = SUBFOLDER_TO_FACTION[detected.key];
      if (!factionKey) {
        return { ok: true, domain: "faction", key: detected.key };
      }
      jsonPath = `${folderAbs.faction}${sep}${factionKey}.json`;
      // Re-tag the key with the resolved faction so the SSE event matches what
      // the client actually subscribes to.
      detected.key = factionKey;
      break;
    }
    case "npc": {
      // detected.key is the .tres basename (e.g. "eddie_npc_data"). We need
      // the NpcId for the JSON filename, but the .tres is gone — best-effort
      // heuristic: strip the `_npc_data` suffix used by the current files.
      const stripped = detected.key.replace(/_npc_data$/, "");
      jsonPath = `${folderAbs.npc}${sep}${stripped}.json`;
      detected.key = stripped;
      break;
    }
    case "quest":
      jsonPath = `${folderAbs.quest}${sep}${detected.key}.json`;
      break;
    case "dialog": {
      const [folder, id] = detected.key.split("/");
      jsonPath = `${folderAbs.dialog}${sep}${folder}${sep}${id}.json`;
      break;
    }
    case "balloon": {
      const [folder, id] = detected.key.split("/");
      jsonPath = `${folderAbs.balloon}${sep}${folder}${sep}${id}.json`;
      break;
    }
    default:
      return { ok: false, error: `unhandled domain ${detected.domain}` };
  }
  try {
    await unlink(jsonPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: (err as Error).message };
    }
  }
  return {
    ok: true,
    domain: detected.domain,
    key: detected.key,
    jsonPath,
  };
}

async function writeJson(absPath: string, data: unknown): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, JSON.stringify(data, null, 2), "utf8");
}

// Re-export for callers that need to disambiguate (rarely).
export type { ParsedTres };
