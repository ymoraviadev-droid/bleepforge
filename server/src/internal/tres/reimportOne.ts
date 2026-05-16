// Per-file re-import: given an absolute path to a .tres in the Godot
// project, detect its domain, parse, run the matching import mapper, and
// overwrite Bleepforge's JSON. Used by the watcher to keep JSON in sync
// when the .tres is edited externally.

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname, sep } from "node:path";

import { config, folderAbs } from "../../config.js";
import { projectIndex } from "../../lib/projectIndex/index.js";
import {
  mapBalloon,
  mapDialogSequence,
  mapFaction,
  mapItem,
  mapKarma,
  mapNpc,
  mapQuest,
  resPathToAbs,
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

// Set of SyncDomain literals — kept here to gate "is this entry's
// domain known to the sync bus?" Manifest-declared domains aren't in
// this set, so they correctly return null from detectDomain (no
// existing import mapper exists for them; reimport is a no-op until
// the generic importer lands in v0.2.8).
const SYNC_DOMAINS: ReadonlySet<SyncDomain> = new Set<SyncDomain>([
  "item",
  "karma",
  "quest",
  "dialog",
  "npc",
  "faction",
  "balloon",
  "shader",
]);

function asSyncDomain(domain: string): SyncDomain | null {
  return SYNC_DOMAINS.has(domain as SyncDomain) ? (domain as SyncDomain) : null;
}

// Determines the domain + canonical id from a .tres path. Reads from
// ProjectIndex — content-driven, no hardcoded folder pattern matching.
// Returns null if the file isn't indexed (e.g. a support resource the
// classifier didn't bucket into any domain) OR if the file's domain is
// manifest-declared (not yet in the sync event bus's vocabulary).
export function detectDomain(absPath: string): {
  domain: SyncDomain;
  key: string;
} | null {
  const entry = projectIndex.getByAbsPath(absPath);
  if (!entry) return null;
  if (!("id" in entry)) return null; // IndexedPickup — has no id
  const domain = asSyncDomain(entry.domain);
  if (!domain) return null; // manifest-only domain; v0.2.8 wires reimport
  // entry.id is the canonical identity (Slug for items, NpcId for npcs,
  // composite "folder/basename" for balloons + dialogs, Faction enum
  // string for factions). For dialogs, the SyncEvent shape historically
  // used "folder/Id" — preserve that for the client subscribers (they
  // listen on the composite key from the dialog list pages).
  if (domain === "dialog" && entry.folder) {
    return { domain: "dialog", key: `${entry.folder}/${entry.id}` };
  }
  return { domain, key: entry.id };
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

  // Each mapper internally calls resPathToAbs() WITHOUT a root, which falls
  // back to process.env.GODOT_PROJECT_ROOT. When the actual root came from
  // preferences.json (the common case), that env var is unset and the
  // texture paths stay as raw "res://..." strings — invalid as filesystem
  // paths, so the asset router rejects them as "outside allowed roots."
  // Boot reconcile works around this by post-processing the same fields
  // here with the real config.godotProjectRoot; we mirror that pass for
  // every domain that ships a texture path. The fix surfaced after the
  // Maor / Windows test: dialog edits in Godot → watcher reimport → JSON
  // portraits became "res://characters/art/eddie.png" → broken thumbs
  // until restart (because boot reconcile would re-run and overwrite).
  const root = config.godotProjectRoot;
  switch (detected.domain) {
    case "item": {
      const item = mapItem(parsed);
      if (!item) return { ok: false, error: "mapItem returned null (no Slug?)" };
      if (root && item.Icon && item.Icon.startsWith("res://")) {
        item.Icon = resPathToAbs(item.Icon, root);
      }
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
      if (root) {
        if (faction.Icon && faction.Icon.startsWith("res://")) {
          faction.Icon = resPathToAbs(faction.Icon, root);
        }
        if (faction.Banner && faction.Banner.startsWith("res://")) {
          faction.Banner = resPathToAbs(faction.Banner, root);
        }
      }
      const jsonPath = `${folderAbs.faction}${sep}${faction.Faction}.json`;
      await writeJson(jsonPath, faction);
      return { ok: true, domain: "faction", key: faction.Faction, jsonPath };
    }
    case "npc": {
      // Resolve dialog refs via ProjectIndex: each ext_resource's path is
      // looked up in the index, and the indexed entry's `id` is the
      // canonical DialogSequence Id. Content-driven, so the dialog .tres
      // can live anywhere in the project.
      const npc = mapNpc(parsed, {
        resolveDialogSequenceId: (p, id) => {
          const ext = p.extResources.get(id);
          if (!ext) return null;
          const entry = projectIndex.getByResPath(ext.path);
          return entry && entry.domain === "dialog" ? entry.id : null;
        },
      });
      if (!npc) return { ok: false, error: "mapNpc returned null" };
      if (root && npc.Portrait && npc.Portrait.startsWith("res://")) {
        npc.Portrait = resPathToAbs(npc.Portrait, root);
      }
      const jsonPath = `${folderAbs.npc}${sep}${npc.NpcId}.json`;
      await writeJson(jsonPath, npc);
      return { ok: true, domain: "npc", key: npc.NpcId, jsonPath };
    }
    case "quest": {
      // Same pattern for item refs.
      const quest = mapQuest(parsed, {
        resolveItemSlugByExtRef: (p, id) => {
          const ext = p.extResources.get(id);
          if (!ext) return null;
          const entry = projectIndex.getByResPath(ext.path);
          return entry && entry.domain === "item" ? entry.id : null;
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
      if (root) {
        for (const line of dialog.Lines) {
          if (line.Portrait && line.Portrait.startsWith("res://")) {
            line.Portrait = resPathToAbs(line.Portrait, root);
          }
        }
      }
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
// Caller must NOT remove the file from ProjectIndex before invoking this
// — detectDomain reads from the index to recover the canonical key.
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
    case "faction":
      jsonPath = `${folderAbs.faction}${sep}${detected.key}.json`;
      break;
    case "npc":
      jsonPath = `${folderAbs.npc}${sep}${detected.key}.json`;
      break;
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
