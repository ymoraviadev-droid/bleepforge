import fs from "node:fs/promises";
import path from "node:path";
import {
  FactionDataSchema,
  ItemSchema,
  KarmaImpactSchema,
  QuestSchema,
} from "@bleepforge/shared";
import { folderAbs } from "../config.js";
import * as dialogStorage from "../dialog/storage.js";
import { makeJsonStorage } from "../util/jsonCrud.js";
import {
  mapDialogSequence,
  mapFaction,
  mapItem,
  mapKarma,
  mapQuest,
  resPathToAbs,
} from "./mappers.js";
import { parseTres, type ParsedTres } from "./tresParser.js";

export interface ImportOptions {
  godotProjectRoot: string;
  /** When true, parse + report but don't write JSON files. */
  dryRun?: boolean;
}

export interface ImportResult {
  ok: boolean;
  godotProjectRoot: string;
  dryRun: boolean;
  domains: {
    items: DomainResult;
    quests: DomainResult;
    karma: DomainResult;
    factions: DomainResult;
    dialogs: DialogDomainResult;
  };
}

interface DomainResult {
  imported: string[];
  skipped: { file: string; reason: string }[];
  errors: { file: string; error: string }[];
}

interface DialogDomainResult {
  imported: { folder: string; id: string; file: string }[];
  skipped: { folder: string; file: string; reason: string }[];
  errors: { folder: string; file: string; error: string }[];
}

const KNOWN_DIALOG_FOLDERS: { godotPath: string; bleepforgeFolder: string }[] = [
  {
    godotPath: "world/interactibles/standing_terminal/dialogs/welcome",
    bleepforgeFolder: "welcome",
  },
  {
    godotPath: "world/interactibles/standing_terminal/dialogs/cut_door_001",
    bleepforgeFolder: "cut_door_001",
  },
  {
    godotPath: "characters/npcs/hap_500/dialogs/Eddie",
    bleepforgeFolder: "Eddie",
  },
  {
    godotPath: "characters/npcs/sld_300/dialogs/Krang",
    bleepforgeFolder: "Krang",
  },
  {
    godotPath: "characters/npcs/sld_300/dialogs/Korjack",
    bleepforgeFolder: "Korjack",
  },
];

const ITEMS_GODOT_PATH = "shared/items/data";
const QUESTS_GODOT_PATH = "shared/components/quest/quests";
const KARMA_GODOT_PATH = "shared/components/karma/impacts";
const FACTIONS_GODOT_PATH = "shared/components/factions";

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const root = path.resolve(opts.godotProjectRoot);
  const dryRun = !!opts.dryRun;

  // Verify project root exists
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${root}`);
    }
  } catch (err) {
    throw new Error(
      `GODOT_PROJECT_ROOT not accessible: ${root} (${(err as Error).message})`,
    );
  }

  // 1. Items pass — needed first so quests can resolve TargetItem ExtResource → slug.
  const itemAbsToSlug = new Map<string, string>();
  const items: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  const itemsDir = path.join(root, ITEMS_GODOT_PATH);
  for await (const filePath of walkTres(itemsDir)) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const parsed = parseTres(text);
      const item = mapItem(parsed);
      if (!item) {
        items.skipped.push({
          file: filePath,
          reason: `script_class is "${parsed.scriptClass ?? "?"}", not ItemData/QuestItemData`,
        });
        continue;
      }
      // Re-resolve Icon path now that we know the project root (mapItem reads from env)
      if (item.Icon && item.Icon.startsWith("res://")) {
        item.Icon = resPathToAbs(item.Icon, root);
      }
      const validated = ItemSchema.parse(item);
      itemAbsToSlug.set(filePath, validated.Slug);
      if (!dryRun) {
        const storage = makeJsonStorage(ItemSchema, folderAbs.item, "Slug");
        await storage.write(validated);
      }
      items.imported.push(validated.Slug);
    } catch (err) {
      items.errors.push({ file: filePath, error: String(err) });
    }
  }

  // 2. Quests pass — uses itemAbsToSlug to resolve TargetItem refs.
  const quests: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  const questsDir = path.join(root, QUESTS_GODOT_PATH);
  for await (const filePath of walkTres(questsDir)) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const parsed = parseTres(text);
      const ctx = {
        resolveItemSlugByExtRef: (p: ParsedTres, extId: string) => {
          const ext = p.extResources.get(extId);
          if (!ext || !ext.path) return null;
          const targetAbs = resPathToAbs(ext.path, root);
          return itemAbsToSlug.get(targetAbs) ?? null;
        },
      };
      const quest = mapQuest(parsed, ctx);
      if (!quest) {
        quests.skipped.push({
          file: filePath,
          reason: `script_class is "${parsed.scriptClass ?? "?"}", not Quest`,
        });
        continue;
      }
      const validated = QuestSchema.parse(quest);
      if (!dryRun) {
        const storage = makeJsonStorage(QuestSchema, folderAbs.quest, "Id");
        await storage.write(validated);
      }
      quests.imported.push(validated.Id);
    } catch (err) {
      quests.errors.push({ file: filePath, error: String(err) });
    }
  }

  // 3. Karma pass — independent of others.
  const karma: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  const karmaDir = path.join(root, KARMA_GODOT_PATH);
  for await (const filePath of walkTres(karmaDir)) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const parsed = parseTres(text);
      const k = mapKarma(parsed);
      if (!k) {
        karma.skipped.push({
          file: filePath,
          reason: `script_class is "${parsed.scriptClass ?? "?"}", not KarmaImpact`,
        });
        continue;
      }
      const validated = KarmaImpactSchema.parse(k);
      if (!dryRun) {
        const storage = makeJsonStorage(KarmaImpactSchema, folderAbs.karma, "Id");
        await storage.write(validated);
      }
      karma.imported.push(validated.Id);
    } catch (err) {
      karma.errors.push({ file: filePath, error: String(err) });
    }
  }

  // 4. Factions pass — independent. One .tres per Faction enum value, in
  // per-faction subfolders. The Robotek folder has art only (no .tres) and
  // is intentionally lore-only — it'll show as zero hits, no errors.
  const factions: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  const factionsDir = path.join(root, FACTIONS_GODOT_PATH);
  for await (const filePath of walkTres(factionsDir)) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const parsed = parseTres(text);
      const f = mapFaction(parsed);
      if (!f) {
        factions.skipped.push({
          file: filePath,
          reason: `script_class is "${parsed.scriptClass ?? "?"}", not FactionData`,
        });
        continue;
      }
      // Re-resolve Icon/Banner against the actual root.
      if (f.Icon && f.Icon.startsWith("res://")) f.Icon = resPathToAbs(f.Icon, root);
      if (f.Banner && f.Banner.startsWith("res://")) f.Banner = resPathToAbs(f.Banner, root);
      const validated = FactionDataSchema.parse(f);
      if (!dryRun) {
        const storage = makeJsonStorage(FactionDataSchema, folderAbs.faction, "Faction");
        await storage.write(validated);
      }
      factions.imported.push(validated.Faction);
    } catch (err) {
      factions.errors.push({ file: filePath, error: String(err) });
    }
  }

  // 5. Dialogs pass — per folder.
  const dialogs: DialogDomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  for (const { godotPath, bleepforgeFolder } of KNOWN_DIALOG_FOLDERS) {
    const dir = path.join(root, godotPath);
    for await (const filePath of walkTres(dir)) {
      try {
        const text = await fs.readFile(filePath, "utf8");
        const parsed = parseTres(text);
        const seq = mapDialogSequence(parsed);
        if (!seq) {
          dialogs.skipped.push({
            folder: bleepforgeFolder,
            file: filePath,
            reason: `script_class is "${parsed.scriptClass ?? "?"}", not DialogSequence`,
          });
          continue;
        }
        // Re-resolve Portrait paths against the actual root (mapper used env var).
        for (const line of seq.Lines) {
          if (line.Portrait && line.Portrait.startsWith("res://")) {
            line.Portrait = resPathToAbs(line.Portrait, root);
          }
        }
        if (!dryRun) {
          await dialogStorage.write(bleepforgeFolder, seq);
        }
        dialogs.imported.push({
          folder: bleepforgeFolder,
          id: seq.Id,
          file: filePath,
        });
      } catch (err) {
        dialogs.errors.push({
          folder: bleepforgeFolder,
          file: filePath,
          error: String(err),
        });
      }
    }
  }

  return {
    ok: true,
    godotProjectRoot: root,
    dryRun,
    domains: { items, quests, karma, factions, dialogs },
  };
}

async function* walkTres(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkTres(full);
    } else if (e.isFile() && e.name.endsWith(".tres")) {
      yield full;
    }
  }
}
