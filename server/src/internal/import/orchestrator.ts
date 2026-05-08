import fs from "node:fs/promises";
import path from "node:path";
import {
  BalloonSchema,
  FactionDataSchema,
  ItemSchema,
  KarmaImpactSchema,
  NpcSchema,
  QuestSchema,
} from "@bleepforge/shared";
import { folderAbs } from "../../config.js";
import * as balloonStorage from "../../features/balloon/storage.js";
import * as dialogStorage from "../../features/dialog/storage.js";
import { makeJsonStorage } from "../../lib/util/jsonCrud.js";
import { discoverGodotContent, type Discovery } from "./discover.js";
import {
  mapBalloon,
  mapDialogSequence,
  mapFaction,
  mapItem,
  mapKarma,
  mapNpc,
  mapQuest,
  resPathToAbs,
} from "./mappers.js";
import { parseTres, type ParsedTres } from "./tresParser.js";

export interface ImportOptions {
  godotProjectRoot: string;
}

export interface ImportResult {
  ok: boolean;
  godotProjectRoot: string;
  domains: {
    items: DomainResult;
    quests: DomainResult;
    karma: DomainResult;
    factions: DomainResult;
    dialogs: DialogDomainResult;
    npcs: DomainResult;
    balloons: BalloonDomainResult;
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

interface BalloonDomainResult {
  imported: { folder: string; id: string; file: string }[];
  skipped: { folder: string; file: string; reason: string }[];
  errors: { folder: string; file: string; error: string }[];
}

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const root = path.resolve(opts.godotProjectRoot);

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

  // Discovery: walk the project once and bucket every .tres by its
  // script_class. Replaces the previous hardcoded folder lists, so adding
  // a new NPC (with its own dialogs/<Speaker>/ folder) just works without
  // a code change.
  const discovery: Discovery = await discoverGodotContent(root);

  // 1. Items pass — needed first so quests can resolve TargetItem ExtResource → slug.
  const itemAbsToSlug = new Map<string, string>();
  const items: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  for (const filePath of discovery.items) {
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
      const storage = makeJsonStorage(ItemSchema, folderAbs.item, "Slug");
      await storage.write(validated);
      items.imported.push(validated.Slug);
    } catch (err) {
      items.errors.push({ file: filePath, error: (err as Error).message ?? String(err) });
    }
  }

  // 2. Quests pass — uses itemAbsToSlug to resolve TargetItem refs.
  const quests: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  for (const filePath of discovery.quests) {
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
      const storage = makeJsonStorage(QuestSchema, folderAbs.quest, "Id");
      await storage.write(validated);
      quests.imported.push(validated.Id);
    } catch (err) {
      quests.errors.push({ file: filePath, error: (err as Error).message ?? String(err) });
    }
  }

  // 3. Karma pass — independent of others.
  const karma: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  for (const filePath of discovery.karma) {
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
      const storage = makeJsonStorage(KarmaImpactSchema, folderAbs.karma, "Id");
      await storage.write(validated);
      karma.imported.push(validated.Id);
    } catch (err) {
      karma.errors.push({ file: filePath, error: (err as Error).message ?? String(err) });
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
  for (const filePath of discovery.factions) {
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
      const storage = makeJsonStorage(FactionDataSchema, folderAbs.faction, "Faction");
      await storage.write(validated);
      factions.imported.push(validated.Faction);
    } catch (err) {
      factions.errors.push({ file: filePath, error: (err as Error).message ?? String(err) });
    }
  }

  // 5. Dialogs pass — per folder, where the Bleepforge folder name is the
  // discovered parent-dir basename (e.g. ".../dialogs/Krang/foo.tres" →
  // "Krang"). Also builds a path→Id map for the NPC pass (NpcData and
  // NpcQuestEntry reference DialogSequence resources by ext-path; we need
  // to convert those refs to DialogSequence Ids in JSON).
  const dialogs: DialogDomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  const dialogAbsToId = new Map<string, string>();
  for (const [bleepforgeFolder, paths] of discovery.dialogs) {
    for (const filePath of paths) {
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
        dialogAbsToId.set(filePath, seq.Id);
        // Re-resolve Portrait paths against the actual root (mapper used env var).
        for (const line of seq.Lines) {
          if (line.Portrait && line.Portrait.startsWith("res://")) {
            line.Portrait = resPathToAbs(line.Portrait, root);
          }
        }
        await dialogStorage.write(bleepforgeFolder, seq);
        dialogs.imported.push({
          folder: bleepforgeFolder,
          id: seq.Id,
          file: filePath,
        });
      } catch (err) {
        dialogs.errors.push({
          folder: bleepforgeFolder,
          file: filePath,
          error: (err as Error).message ?? String(err),
        });
      }
    }
  }

  // 6. Balloons pass — flat per-folder import, mirrors the dialogs pass.
  // The Bleepforge id is the .tres filename basename (BalloonLine has no Id
  // property in C#). Also builds a path → "<folder>/<basename>" map for the
  // NPC pass to resolve CasualRemark ext_resource refs.
  const balloons: BalloonDomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  const balloonAbsToId = new Map<string, string>();
  for (const [bleepforgeFolder, paths] of discovery.balloons) {
    for (const filePath of paths) {
      try {
        const text = await fs.readFile(filePath, "utf8");
        const parsed = parseTres(text);
        const basename = path.basename(filePath, ".tres");
        const balloon = mapBalloon(parsed, basename);
        if (!balloon) {
          balloons.skipped.push({
            folder: bleepforgeFolder,
            file: filePath,
            reason: `script_class is "${parsed.scriptClass ?? "?"}", not BalloonLine`,
          });
          continue;
        }
        const validated = BalloonSchema.parse(balloon);
        await balloonStorage.write(bleepforgeFolder, validated);
        balloonAbsToId.set(filePath, `${bleepforgeFolder}/${validated.Id}`);
        balloons.imported.push({
          folder: bleepforgeFolder,
          id: validated.Id,
          file: filePath,
        });
      } catch (err) {
        balloons.errors.push({
          folder: bleepforgeFolder,
          file: filePath,
          error: (err as Error).message ?? String(err),
        });
      }
    }
  }

  // 7. NPCs pass — uses dialogAbsToId to resolve DialogSequence refs and
  // balloonAbsToId to resolve CasualRemark refs into "<folder>/<basename>"
  // form. Discovery already filtered to script_class="NpcData", so every
  // entry here is the NPC root resource by definition.
  const npcs: DomainResult = {
    imported: [],
    skipped: [],
    errors: [],
  };
  for (const filePath of discovery.npcs) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const parsed = parseTres(text);
      const ctx = {
        resolveDialogSequenceId: (p: ParsedTres, extId: string) => {
          const ext = p.extResources.get(extId);
          if (!ext || !ext.path) return null;
          const targetAbs = resPathToAbs(ext.path, root);
          return dialogAbsToId.get(targetAbs) ?? null;
        },
        resolveBalloonId: (p: ParsedTres, extId: string) => {
          const ext = p.extResources.get(extId);
          if (!ext || !ext.path) return null;
          const targetAbs = resPathToAbs(ext.path, root);
          return balloonAbsToId.get(targetAbs) ?? null;
        },
      };
      const npc = mapNpc(parsed, ctx);
      if (!npc) {
        npcs.skipped.push({
          file: filePath,
          reason: `script_class is "${parsed.scriptClass ?? "?"}", not NpcData`,
        });
        continue;
      }
      // Re-resolve Portrait against the actual root.
      if (npc.Portrait && npc.Portrait.startsWith("res://")) {
        npc.Portrait = resPathToAbs(npc.Portrait, root);
      }
      const validated = NpcSchema.parse(npc);
      const storage = makeJsonStorage(NpcSchema, folderAbs.npc, "NpcId");
      await storage.write(validated);
      npcs.imported.push(validated.NpcId);
    } catch (err) {
      npcs.errors.push({ file: filePath, error: (err as Error).message ?? String(err) });
    }
  }

  return {
    ok: true,
    godotProjectRoot: root,
    domains: { items, quests, karma, factions, dialogs, npcs, balloons },
  };
}
