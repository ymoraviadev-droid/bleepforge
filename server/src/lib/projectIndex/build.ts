// Whole-project walk that classifies every .tres + .tscn and extracts
// identity in a single pass. Returns the populated maps the index
// singleton holds.
//
// Classification rules are content-only — no hardcoded folder paths
// anywhere. This is the core of why moving .tres files around inside the
// Godot project doesn't break Bleepforge: the file's *content* is what
// determines its identity and domain, not its path.
//
// One read per file. Pickup detection looks for `DbItemName = "..."` on
// the root node of a .tscn; we read the file regardless and rely on the
// regex matching only when the property is present, so non-pickup .tscn
// files are cheap pass-throughs.

import fs from "node:fs/promises";
import path from "node:path";

import type { Entry, FieldDef } from "@bleepforge/shared";
import { manifestCache } from "../manifest/cache.js";
import type { IndexedTres, IndexedPickup } from "./types.js";

// ---- Regexes ---------------------------------------------------------------

const TRES_UID_RE = /^\[gd_resource[^\]]*\buid="([^"]+)"/m;
const TSCN_UID_RE = /^\[gd_scene[^\]]*\buid="([^"]+)"/m;
const SCRIPT_CLASS_RE = /script_class="([^"]+)"/;
const SLUG_RE = /^\s*Slug\s*=\s*"([^"]+)"/m;
const ID_RE = /^\s*Id\s*=\s*"([^"]+)"/m;
const NPC_ID_RE = /^\s*NpcId\s*=\s*"([^"]+)"/m;
const FACTION_INT_RE = /^\s*Faction\s*=\s*(\d+)/m;
const DB_ITEM_NAME_RE = /^DbItemName\s*=\s*"([^"]*)"/m;

const FACTION_INT_TO_ENUM: Record<number, string> = {
  0: "Scavengers",
  1: "FreeRobots",
  2: "RFF",
  3: "Grove",
};

// ---- Output buckets --------------------------------------------------------

export interface BuildResult {
  /** All .tres entries, keyed by `<domain>:<id>` for fast lookup. */
  tresEntries: IndexedTres[];
  /** All .tscn pickup entries (those with DbItemName on root node). */
  pickupEntries: IndexedPickup[];
  /** Total files visited (.tres + .tscn). For boot logging. */
  filesVisited: number;
}

// ---- Public entry point ----------------------------------------------------

export async function buildProjectIndex(
  godotRoot: string,
): Promise<BuildResult> {
  const result: BuildResult = {
    tresEntries: [],
    pickupEntries: [],
    filesVisited: 0,
  };
  await walk(godotRoot, godotRoot, result);
  return result;
}

// ---- Walker ----------------------------------------------------------------

async function walk(
  dir: string,
  godotRoot: string,
  out: BuildResult,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    // Skip dot-dirs (.godot cache, .git, .import) and hidden files.
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, godotRoot, out);
      continue;
    }
    if (!e.isFile()) continue;
    if (e.name.endsWith(".tres")) {
      out.filesVisited++;
      await classifyTres(full, godotRoot, out);
    } else if (e.name.endsWith(".tscn")) {
      out.filesVisited++;
      await classifyTscn(full, godotRoot, out);
    }
  }
}

// ---- Classification --------------------------------------------------------

async function classifyTres(
  absPath: string,
  godotRoot: string,
  out: BuildResult,
): Promise<void> {
  const entry = await classifyTresOne(absPath, godotRoot);
  if (entry) out.tresEntries.push(entry);
}

/**
 * Single-file .tres classifier. Used by the index's upsert path so we
 * can refresh one file's entry without re-walking the project. Returns
 * null if the file doesn't match any indexed domain (e.g. inline
 * LootTable resources, support files).
 */
export async function classifyTresOne(
  absPath: string,
  godotRoot: string,
): Promise<IndexedTres | null> {
  let text: string;
  try {
    text = await fs.readFile(absPath, "utf8");
  } catch {
    return null;
  }

  const scriptClass = SCRIPT_CLASS_RE.exec(text)?.[1] ?? null;
  const uid = TRES_UID_RE.exec(text)?.[1] ?? null;
  const resPath = absToResPath(absPath, godotRoot);

  // Manifest-declared domains FIRST. Earlier (v0.2.7 #9) ordering put
  // FoB classifiers first with manifest as fallback, but test-project
  // discovered the flaw: FoB's "any resource with a Slug field is an
  // item" check is greedy and would eat user-domain .tres files whose
  // schema also happens to have a Slug field (test-project's Note +
  // Equipment both do). Manifest-first matches the load-bearing
  // direction of the genericization arc — the user's manifest IS the
  // source of truth for their project; FoB's hardcoded classifiers are
  // a fallback that gets emptier with every release until FoB ports.
  // Empty/missing manifest → loop is a cheap no-op, FoB unaffected.
  for (const entry of manifestCache.listDomains()) {
    const classified = classifyAgainstManifestEntry(
      entry,
      text,
      absPath,
      godotRoot,
      scriptClass,
      uid,
      resPath,
    );
    if (classified) return classified;
  }

  // script_class-discriminated domains.
  switch (scriptClass) {
    case "Quest": {
      const id = ID_RE.exec(text)?.[1];
      if (!id) return null;
      return {
        domain: "quest",
        id,
        absPath,
        resPath,
        uid,
        scriptClass,
        folder: null,
      };
    }
    case "KarmaImpact": {
      const id = ID_RE.exec(text)?.[1];
      if (!id) return null;
      return {
        domain: "karma",
        id,
        absPath,
        resPath,
        uid,
        scriptClass,
        folder: null,
      };
    }
    case "FactionData": {
      // Faction = 0 is omitted by Godot's serializer (default value), so
      // missing line means Scavengers. Non-default values get the int.
      const m = FACTION_INT_RE.exec(text);
      const factionInt = m && m[1] ? Number(m[1]) : 0;
      const id = FACTION_INT_TO_ENUM[factionInt];
      if (!id) return null; // unknown faction int — skip
      return {
        domain: "faction",
        id,
        absPath,
        resPath,
        uid,
        scriptClass,
        folder: null,
      };
    }
    case "NpcData": {
      const id = NPC_ID_RE.exec(text)?.[1];
      if (!id) return null;
      return {
        domain: "npc",
        id,
        absPath,
        resPath,
        uid,
        scriptClass,
        folder: null,
      };
    }
    case "DialogSequence": {
      const id = ID_RE.exec(text)?.[1];
      if (!id) return null;
      // Convention: .tres lives at .../dialogs/<folder>/<id>.tres. The
      // immediate parent dir basename is the folder (Eddie, Krang, etc.).
      const folder = path.basename(path.dirname(absPath));
      return {
        domain: "dialog",
        id,
        absPath,
        resPath,
        uid,
        scriptClass,
        folder,
      };
    }
    case "BalloonLine": {
      // Convention: characters/npcs/<model>/balloons/<basename>.tres.
      // The immediate parent must be named "balloons"; grandparent is
      // the NPC model. Skip files outside that convention so we don't
      // accidentally bucket unrelated BalloonLines (defensive).
      const parentDir = path.dirname(absPath);
      if (path.basename(parentDir) !== "balloons") return null;
      const model = path.basename(path.dirname(parentDir));
      const basename = path.basename(absPath, ".tres");
      const id = `${model}/${basename}`;
      return {
        domain: "balloon",
        id,
        absPath,
        resPath,
        uid,
        scriptClass,
        folder: model,
      };
    }
  }

  // Items: any resource with a Slug field, regardless of script_class.
  // Catches ItemData + every subclass (MedkitData, WeaponData, …) without
  // needing a class allowlist that goes stale every time a new C# subclass
  // is added.
  const slugMatch = SLUG_RE.exec(text);
  if (slugMatch && slugMatch[1]) {
    return {
      domain: "item",
      id: slugMatch[1],
      absPath,
      resPath,
      uid,
      scriptClass,
      folder: null,
    };
  }

  // Manifest-declared domains. FoB classifiers above run first; this
  // path fires only when no FoB rule matched the file. Each manifest
  // domain's classification predicate is derived from its entry kind +
  // class name + (for foldered) parent-dir convention. The manifest
  // cache holds the parsed manifest; if it's empty or not loaded, this
  // loop is a cheap no-op.
  for (const entry of manifestCache.listDomains()) {
    const classified = classifyAgainstManifestEntry(
      entry,
      text,
      absPath,
      godotRoot,
      scriptClass,
      uid,
      resPath,
    );
    if (classified) return classified;
  }

  // Anything else (inline LootTable, support resources, etc.) is ignored.
  return null;
}

// ---- Manifest-driven classification ---------------------------------------

/** Match one .tres against one manifest entry. Returns the IndexedTres if
 *  the file matches the entry's classification predicate, null otherwise.
 *  Each of the four entry kinds has its own predicate shape — see kind
 *  switch below for the rules. Exported for the smoke test; production
 *  callers go through classifyTresOne. */
export function classifyAgainstManifestEntry(
  entry: Entry,
  text: string,
  absPath: string,
  godotRoot: string,
  scriptClass: string | null,
  uid: string | null,
  resPath: string,
): IndexedTres | null {
  switch (entry.kind) {
    case "domain": {
      if (scriptClass !== entry.class) return null;
      const id = extractKeyValue(text, entry.fields, entry.key);
      if (!id) return null;
      return { domain: entry.domain, id, absPath, resPath, uid, scriptClass, folder: null };
    }
    case "foldered": {
      if (scriptClass !== entry.class) return null;
      // Path-based identity: <folder>/<basename>. `folder` is whichever
      // ancestor dir level the manifest declared (parentDir or
      // grandparentDir). `parentNameMustBe` defends against stray
      // .tres files of the same class placed elsewhere in the tree.
      const parentDir = path.dirname(absPath);
      const parentName = path.basename(parentDir);
      if (
        entry.folderDiscovery.parentNameMustBe &&
        parentName !== entry.folderDiscovery.parentNameMustBe
      ) {
        return null;
      }
      const folder =
        entry.folderDiscovery.groupBy === "grandparentDir"
          ? path.basename(path.dirname(parentDir))
          : parentName;
      const basename = path.basename(absPath, ".tres");
      return {
        domain: entry.domain,
        id: `${folder}/${basename}`,
        absPath,
        resPath,
        uid,
        scriptClass,
        folder,
      };
    }
    case "enumKeyed": {
      if (scriptClass !== entry.class) return null;
      // Identity = the enum value's string name. Godot serializes
      // enums as ints, so we read the int + index into entry.enumValues.
      // Default-omission (Godot drops the line when value === enum's
      // first variant) means a missing line maps to enumValues[0].
      const keyRe = new RegExp(`^\\s*${escapeRegex(entry.key)}\\s*=\\s*(-?\\d+)`, "m");
      const m = keyRe.exec(text);
      const idx = m && m[1] ? Number(m[1]) : 0;
      const id = entry.enumValues[idx];
      if (!id) return null;
      return { domain: entry.domain, id, absPath, resPath, uid, scriptClass, folder: null };
    }
    case "discriminatedFamily": {
      // Match against the base class OR any variant class. scriptClass
      // is the underlying file's declared class — for variants it's
      // the variant's name (Sword, Shield), not the base (Equipment).
      // We preserve scriptClass on the entry so downstream consumers
      // (generic edit UI) can route to the right variant fields.
      const baseClass = entry.base.class;
      const variantClasses = entry.variants.map((v) => v.class);
      const matches =
        scriptClass === baseClass || variantClasses.includes(scriptClass ?? "");
      if (!matches) return null;
      const id = extractKeyValue(text, entry.base.fields, entry.key);
      if (!id) return null;
      return { domain: entry.domain, id, absPath, resPath, uid, scriptClass, folder: null };
    }
  }
}

/** Pulls the key field's value from .tres text, picking the regex shape
 *  based on the manifest-declared field type. String / multiline / flag
 *  use the quoted-value form; enum / int use the bare-number form;
 *  others aren't valid identity types in v0.2.7. */
function extractKeyValue(
  text: string,
  fields: Record<string, FieldDef>,
  keyName: string,
): string | null {
  const field = fields[keyName];
  if (!field) return null;
  if (field.type === "string" || field.type === "multiline" || field.type === "flag") {
    const re = new RegExp(`^\\s*${escapeRegex(keyName)}\\s*=\\s*"([^"]*)"`, "m");
    const m = re.exec(text);
    return m && m[1] ? m[1] : null;
  }
  if (field.type === "int") {
    const re = new RegExp(`^\\s*${escapeRegex(keyName)}\\s*=\\s*(-?\\d+)`, "m");
    return re.exec(text)?.[1] ?? null;
  }
  if (field.type === "enum") {
    const re = new RegExp(`^\\s*${escapeRegex(keyName)}\\s*=\\s*(-?\\d+)`, "m");
    const m = re.exec(text);
    const idx = m && m[1] ? Number(m[1]) : 0;
    return field.values[idx] ?? null;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function classifyTscn(
  absPath: string,
  godotRoot: string,
  out: BuildResult,
): Promise<void> {
  const entry = await classifyTscnOne(absPath, godotRoot);
  if (entry) out.pickupEntries.push(entry);
}

/**
 * Single-file .tscn classifier. Returns a pickup entry only if the file's
 * root node carries a `DbItemName = "..."` property. Used by the index's
 * upsert path for one-file refreshes.
 */
export async function classifyTscnOne(
  absPath: string,
  godotRoot: string,
): Promise<IndexedPickup | null> {
  let text: string;
  try {
    text = await fs.readFile(absPath, "utf8");
  } catch {
    return null;
  }
  const dbMatch = DB_ITEM_NAME_RE.exec(text);
  if (!dbMatch) return null;

  const uid = TSCN_UID_RE.exec(text)?.[1] ?? null;
  const resPath = absToResPath(absPath, godotRoot);
  const name = path.basename(absPath, ".tscn");
  return {
    domain: "pickup",
    absPath,
    resPath,
    uid,
    name,
    dbItemName: dbMatch[1] ?? "",
  };
}


// ---- Helpers ---------------------------------------------------------------

function absToResPath(absPath: string, godotRoot: string): string {
  const rel = path.relative(godotRoot, absPath);
  // Godot always uses forward slashes in res:// paths regardless of platform.
  return `res://${rel.split(path.sep).join("/")}`;
}
