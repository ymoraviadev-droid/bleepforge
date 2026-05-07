import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dialogeurRoot = path.resolve(here, "..", "..");

const dataRoot = path.resolve(dialogeurRoot, process.env.DATA_ROOT ?? "data");
const assetRoot = path.resolve(process.env.ASSET_ROOT ?? os.homedir());

// Resolve the Godot project root once at module init. Preferences win over
// env so the in-app Preferences UI is the canonical knob; env stays as a
// bootstrap fallback for first-run before preferences.json exists. Changes
// to the prefs value require a server restart to take effect (no hot-swap
// in v1) — the in-process value here is captured at boot and never mutated.
function resolveGodotProjectRoot(): {
  path: string | null;
  source: "preferences" | "env" | null;
} {
  const prefsFile = path.join(dataRoot, "preferences.json");
  try {
    const raw = fs.readFileSync(prefsFile, "utf8");
    const parsed = JSON.parse(raw);
    const candidate =
      typeof parsed.godotProjectRoot === "string"
        ? parsed.godotProjectRoot.trim()
        : "";
    if (candidate) {
      return { path: path.resolve(candidate), source: "preferences" };
    }
  } catch {
    // No preferences.json yet, malformed JSON, or missing field — fall
    // through to env. We don't surface the read error: the file is
    // optional, and the server still validates on PUT.
  }
  if (process.env.GODOT_PROJECT_ROOT) {
    return {
      path: path.resolve(process.env.GODOT_PROJECT_ROOT),
      source: "env",
    };
  }
  return { path: null, source: null };
}

const resolved = resolveGodotProjectRoot();

export const config = {
  dataRoot,
  assetRoot,
  godotProjectRoot: resolved.path,
  godotProjectRootSource: resolved.source,
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
