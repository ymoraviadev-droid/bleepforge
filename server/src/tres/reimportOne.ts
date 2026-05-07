// Per-file re-import: given an absolute path to a .tres in the Godot
// project, detect its domain, parse, run the matching import mapper, and
// overwrite Bleepforge's JSON. Used by the watcher to keep JSON in sync
// when the .tres is edited externally.

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname, sep } from "node:path";

import { folderAbs } from "../config.js";
import { parseTres } from "./parser.js";
import {
  mapItem,
  mapKarma,
  mapQuest,
  mapDialogSequence,
} from "../import/mappers.js";
import type { ParsedTres } from "../import/tresParser.js";
// Import the lossy parser used by the import path. We use it because the
// import mappers consume its TresValue shape, not the round-trip parser's
// raw spans.
import { parseTres as parseTresLossy } from "../import/tresParser.js";
import type { SyncDomain } from "../sync/eventBus.js";

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
    case "quest":
      jsonPath = `${folderAbs.quest}${sep}${detected.key}.json`;
      break;
    case "dialog": {
      const [folder, id] = detected.key.split("/");
      jsonPath = `${folderAbs.dialog}${sep}${folder}${sep}${id}.json`;
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
