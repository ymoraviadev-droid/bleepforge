import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dialogeurRoot = path.resolve(here, "..", "..");

const dataRoot = path.resolve(dialogeurRoot, process.env.DATA_ROOT ?? "data");
const assetRoot = path.resolve(process.env.ASSET_ROOT ?? os.homedir());
const godotProjectRoot = process.env.GODOT_PROJECT_ROOT
  ? path.resolve(process.env.GODOT_PROJECT_ROOT)
  : null;

export const config = {
  dataRoot,
  assetRoot,
  godotProjectRoot,
  port: Number(process.env.PORT ?? 4000),
};

export const folderAbs = {
  dialog: path.join(dataRoot, "dialogs"),
  quest: path.join(dataRoot, "quests"),
  item: path.join(dataRoot, "items"),
  karma: path.join(dataRoot, "karma"),
  npc: path.join(dataRoot, "npcs"),
  faction: path.join(dataRoot, "factions"),
};
