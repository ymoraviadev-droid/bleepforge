import path from "node:path";
import type {
  Faction,
  FactionData,
  Item,
  ItemCategory,
  KarmaImpact,
  Npc,
  NpcQuestEntry,
  LootEntry,
  ObjectiveType,
  Quest,
  RewardType,
  DialogSequence,
  DialogSourceType,
} from "@bleepforge/shared";
import {
  valueAsArray,
  valueAsBool,
  valueAsExtRef,
  valueAsNumber,
  valueAsString,
  valueAsSubRef,
  type ParsedTres,
  type TresValue,
} from "./tresParser.js";

// ---- Enum index → string maps ---------------------------------------------
// Order MUST match the C# enum declarations in the Godot project. If Godot
// reorders an enum, these maps need updating too.

const FACTION_BY_INDEX: Faction[] = ["Scavengers", "FreeRobots", "RFF", "Grove"];

const OBJECTIVE_TYPE_BY_INDEX: ObjectiveType[] = [
  "CollectItem",
  "ReachLocation",
  "TalkToNpc",
  "KillNpc",
  "KillEnemyType",
];

const REWARD_TYPE_BY_INDEX: RewardType[] = ["Item", "Flag", "Credits"];

const ITEM_CATEGORY_BY_INDEX: ItemCategory[] = [
  "Misc",
  "Weapon",
  "QuestItem",
  "Upgrade",
  "Consumable",
];

// Mirrors the C# `enum DialogSourceTypes { Npc, Terminal }` order.
const DIALOG_SOURCE_BY_INDEX: DialogSourceType[] = ["Npc", "Terminal"];

// ---- Factions --------------------------------------------------------------

export function mapFaction(parsed: ParsedTres): FactionData | null {
  if (parsed.scriptClass !== "FactionData") return null;
  const props = parsed.resourceProps;
  // Faction enum index. Godot omits the line when value is 0 (Scavengers).
  const factionIdx = valueAsNumber(props.Faction) ?? 0;
  const Faction = FACTION_BY_INDEX[factionIdx] ?? "Scavengers";

  // Icon + Banner are Texture2D ext-resources. Convert res:// → absolute.
  let Icon = "";
  const iconVal = props.Icon;
  if (iconVal?.kind === "ext_ref") {
    const ext = parsed.extResources.get(iconVal.id);
    if (ext && ext.type === "Texture2D" && ext.path) {
      Icon = resPathToAbs(ext.path);
    }
  }
  let Banner = "";
  const bannerVal = props.Banner;
  if (bannerVal?.kind === "ext_ref") {
    const ext = parsed.extResources.get(bannerVal.id);
    if (ext && ext.type === "Texture2D" && ext.path) {
      Banner = resPathToAbs(ext.path);
    }
  }

  return {
    Faction,
    DisplayName: valueAsString(props.DisplayName) ?? "",
    Icon,
    Banner,
    ShortDescription: valueAsString(props.ShortDescription) ?? "",
  };
}

// ---- Karma -----------------------------------------------------------------

export function mapKarma(parsed: ParsedTres): KarmaImpact | null {
  if (parsed.scriptClass !== "KarmaImpact") return null;
  const props = parsed.resourceProps;
  const id = valueAsString(props.Id) ?? "";
  if (!id) throw new Error("Id is empty — KarmaImpact requires a non-empty Id");
  const description = valueAsString(props.Description) ?? "";
  const deltaRefs = valueAsArray(props.Deltas) ?? [];

  const Deltas = deltaRefs
    .map((ref) => {
      const subId = valueAsSubRef(ref);
      if (!subId) return null;
      const sub = parsed.subResources.get(subId);
      if (!sub) return null;
      const factionIdx = valueAsNumber(sub.props.Faction) ?? 0;
      const amount = valueAsNumber(sub.props.Amount) ?? 0;
      return {
        _subId: subId,
        Faction: FACTION_BY_INDEX[factionIdx] ?? "Scavengers",
        Amount: amount,
      };
    })
    .filter((d): d is { _subId: string; Faction: Faction; Amount: number } => d !== null);

  return { Id: id, Description: description, Deltas };
}

// ---- Items (ItemData / QuestItemData) -------------------------------------

export function mapItem(parsed: ParsedTres): Item | null {
  // Accept any resource that has a Slug field — covers ItemData, QuestItemData,
  // and any other subclass (MedkitData, WeaponData, etc.) that extends ItemData.
  // Subclass-specific fields like Damage on WeaponData are dropped: bleepforge
  // is documentation, not the source of truth.
  const props = parsed.resourceProps;
  const slug = valueAsString(props.Slug) ?? "";
  if (!slug) {
    // Discovery already filtered to "has Slug = " line — the only way to reach
    // here is `Slug = ""` literal. That's a broken file, surface as an error
    // (the orchestrator's try/catch routes throws to the errors bucket).
    throw new Error("Slug is empty — file looks like an item but the value is missing");
  }

  const isQuestItem = parsed.scriptClass === "QuestItemData";
  const categoryIdx = valueAsNumber(props.Category);
  // QuestItemData constructor forces Category = QuestItem (idx 2). If a plain
  // ItemData has Category absent, default is Misc (0).
  const category: ItemCategory = isQuestItem
    ? "QuestItem"
    : categoryIdx !== undefined
      ? (ITEM_CATEGORY_BY_INDEX[categoryIdx] ?? "Misc")
      : "Misc";

  // Icon: if it's an ExtResource → Texture2D, we can convert res:// to absolute.
  // If it's a SubResource (AtlasTexture, region of a sprite sheet), we can't
  // serve a region — leave blank for the user to assign their own aseprite path.
  let icon = "";
  const iconVal = props.Icon;
  if (iconVal?.kind === "ext_ref") {
    const ext = parsed.extResources.get(iconVal.id);
    if (ext && ext.type === "Texture2D" && ext.path) {
      icon = resPathToAbs(ext.path);
    }
  }
  // SubResource (AtlasTexture) icons: skip.

  return {
    Slug: slug,
    DisplayName: valueAsString(props.DisplayName) ?? "",
    Description: valueAsString(props.Description) ?? "",
    Icon: icon,
    IsStackable: valueAsBool(props.IsStackable) ?? !isQuestItem,
    MaxStack: valueAsNumber(props.MaxStack) ?? (isQuestItem ? 1 : 99),
    Price: valueAsNumber(props.Price) ?? 0,
    Category: category,
    QuestId: isQuestItem ? (valueAsString(props.QuestId) ?? "") : "",
    CanDrop: isQuestItem ? (valueAsBool(props.CanDrop) ?? false) : false,
  };
}

// ---- Quests ----------------------------------------------------------------

export interface QuestImportContext {
  /** Resolves an ExtResource id (within the current parsed file) → an Item slug.
   *  Used for QuestObjective.TargetItem and QuestReward.Item, which point at
   *  ItemData .tres files via ExtResource. */
  resolveItemSlugByExtRef: (parsed: ParsedTres, extId: string) => string | null;
}

export function mapQuest(parsed: ParsedTres, ctx: QuestImportContext): Quest | null {
  if (parsed.scriptClass !== "Quest") return null;
  const props = parsed.resourceProps;
  const id = valueAsString(props.Id) ?? "";
  if (!id) throw new Error("Id is empty — Quest requires a non-empty Id");

  const Objectives = (valueAsArray(props.Objectives) ?? [])
    .map((ref) => {
      const subId = valueAsSubRef(ref);
      if (!subId) return null;
      const sub = parsed.subResources.get(subId);
      if (!sub) return null;
      const typeIdx = valueAsNumber(sub.props.Type) ?? 0;
      const Type = OBJECTIVE_TYPE_BY_INDEX[typeIdx] ?? "CollectItem";
      let TargetItem = "";
      const tiRef = valueAsExtRef(sub.props.TargetItem);
      if (tiRef) {
        TargetItem = ctx.resolveItemSlugByExtRef(parsed, tiRef) ?? "";
      }
      return {
        _subId: subId,
        Id: valueAsString(sub.props.Id) ?? "",
        Description: valueAsString(sub.props.Description) ?? "",
        Type,
        TargetItem,
        TargetId: valueAsString(sub.props.TargetId) ?? "",
        EnemyType: valueAsString(sub.props.EnemyType) ?? "",
        RequiredCount: valueAsNumber(sub.props.RequiredCount) ?? 1,
        ConsumeOnTurnIn: valueAsBool(sub.props.ConsumeOnTurnIn) ?? true,
      };
    })
    .filter((o) => o !== null) as Quest["Objectives"];

  const Rewards = (valueAsArray(props.Rewards) ?? [])
    .map((ref) => {
      const subId = valueAsSubRef(ref);
      if (!subId) return null;
      const sub = parsed.subResources.get(subId);
      if (!sub) return null;
      const typeIdx = valueAsNumber(sub.props.Type) ?? 0;
      const Type = REWARD_TYPE_BY_INDEX[typeIdx] ?? "Item";
      let Item = "";
      const itemRef = valueAsExtRef(sub.props.Item);
      if (itemRef) {
        Item = ctx.resolveItemSlugByExtRef(parsed, itemRef) ?? "";
      }
      return {
        _subId: subId,
        Type,
        Item,
        Quantity: valueAsNumber(sub.props.Quantity) ?? 1,
        FlagName: valueAsString(sub.props.FlagName) ?? "",
        CreditAmount: valueAsNumber(sub.props.CreditAmount) ?? 0,
      };
    })
    .filter((r) => r !== null) as Quest["Rewards"];

  return {
    Id: id,
    QuestGiverId: valueAsString(props.QuestGiverId) ?? "",
    Title: valueAsString(props.Title) ?? "",
    Description: valueAsString(props.Description) ?? "",
    Objectives,
    Rewards,
    ActiveFlag: valueAsString(props.ActiveFlag) ?? "",
    CompleteFlag: valueAsString(props.CompleteFlag) ?? "",
    TurnedInFlag: valueAsString(props.TurnedInFlag) ?? "",
  };
}

// ---- NPCs (NpcData) --------------------------------------------------------

export interface NpcImportContext {
  /** Resolves an ExtResource id (within the current parsed file) → a
   *  DialogSequence Id. Used for DefaultDialog / OffendedDialog and for
   *  the 5 dialog refs inside each NpcQuestEntry. */
  resolveDialogSequenceId: (parsed: ParsedTres, extId: string) => string | null;
  /** Resolves an ExtResource id pointing at a BalloonLine .tres → the
   *  Bleepforge-id form `<folder>/<basename>`, where <folder> is the
   *  NPC robot model directory. Used for CasualRemark. Returning null
   *  falls back to "" (cleared on import). */
  resolveBalloonId?: (parsed: ParsedTres, extId: string) => string | null;
}

export function mapNpc(parsed: ParsedTres, ctx: NpcImportContext): Npc | null {
  if (parsed.scriptClass !== "NpcData") return null;
  const props = parsed.resourceProps;
  const npcId = valueAsString(props.NpcId) ?? "";
  if (!npcId) throw new Error("NpcId is empty — NpcData requires a non-empty NpcId");

  // Single ext-resource Texture2D → absolute path.
  let Portrait = "";
  const portraitVal = props.Portrait;
  if (portraitVal?.kind === "ext_ref") {
    const ext = parsed.extResources.get(portraitVal.id);
    if (ext && ext.type === "Texture2D" && ext.path) {
      Portrait = resPathToAbs(ext.path);
    }
  }

  // Single ext-resource DialogSequence → DialogSequence Id (or "" if missing).
  const resolveDialog = (val: TresValue | undefined): string => {
    if (!val || val.kind !== "ext_ref") return "";
    return ctx.resolveDialogSequenceId(parsed, val.id) ?? "";
  };

  const Quests = (valueAsArray(props.Quests) ?? [])
    .map((ref): NpcQuestEntry | null => {
      const subId = valueAsSubRef(ref);
      if (!subId) return null;
      const sub = parsed.subResources.get(subId);
      if (!sub) return null;
      return {
        _subId: subId,
        QuestId: valueAsString(sub.props.QuestId) ?? "",
        QuestActiveFlag: valueAsString(sub.props.QuestActiveFlag) ?? "",
        QuestTurnedInFlag: valueAsString(sub.props.QuestTurnedInFlag) ?? "",
        OfferDialog: resolveDialog(sub.props.OfferDialog),
        AcceptedDialog: resolveDialog(sub.props.AcceptedDialog),
        InProgressDialog: resolveDialog(sub.props.InProgressDialog),
        TurnInDialog: resolveDialog(sub.props.TurnInDialog),
        PostQuestDialog: resolveDialog(sub.props.PostQuestDialog),
      };
    })
    .filter((q): q is NpcQuestEntry => q !== null);

  // LootTable is an inline sub-resource — preserved round-trip but not authored
  // in v1. Each LootEntry's PickupScene is kept as the original res:// path.
  let LootTable: Npc["LootTable"] = null;
  const lootVal = props.LootTable;
  if (lootVal?.kind === "sub_ref") {
    const lootSub = parsed.subResources.get(lootVal.id);
    if (lootSub) {
      const Entries = (valueAsArray(lootSub.props.Entries) ?? [])
        .map((eRef): LootEntry | null => {
          const subId = valueAsSubRef(eRef);
          if (!subId) return null;
          const entrySub = parsed.subResources.get(subId);
          if (!entrySub) return null;
          let PickupScene = "";
          const sceneVal = entrySub.props.PickupScene;
          if (sceneVal?.kind === "ext_ref") {
            const ext = parsed.extResources.get(sceneVal.id);
            if (ext && ext.path) PickupScene = ext.path;
          }
          return {
            _subId: subId,
            PickupScene,
            Chance: valueAsNumber(entrySub.props.Chance) ?? 1.0,
            MinAmount: valueAsNumber(entrySub.props.MinAmount) ?? 1,
            MaxAmount: valueAsNumber(entrySub.props.MaxAmount) ?? 1,
          };
        })
        .filter((e): e is LootEntry => e !== null);
      LootTable = { _subId: lootVal.id, Entries };
    }
  }

  // CasualRemarks: array of ext-resource refs to BalloonLine .tres files.
  // Stored in JSON as an array of Bleepforge-id form `<folder>/<basename>` so
  // the NPC form can pick from the balloon catalog (matches how dialog refs
  // store DialogSequence Ids). Godot serializes this as
  // `Array[Object]([ExtResource(...), ...])`.
  //
  // Backwards compat: older .tres files (pre-rename) carry a singular
  // `CasualRemark = ExtResource(...)` line. We accept both forms and
  // normalize to the new array. The writer always emits the plural form,
  // so the next save migrates the file on disk too.
  const resolveBalloon = (extId: string): string => {
    if (ctx.resolveBalloonId) {
      return ctx.resolveBalloonId(parsed, extId) ?? "";
    }
    // Single-file watcher path (no global map): derive from ext.path.
    const ext = parsed.extResources.get(extId);
    if (!ext || !ext.path) return "";
    const m = ext.path.match(
      /[/\\]characters[/\\]npcs[/\\]([^/\\]+)[/\\]balloons[/\\]([^/\\]+)\.tres$/,
    );
    return m ? `${m[1]}/${m[2]}` : "";
  };

  const CasualRemarks: string[] = [];
  const plural = props.CasualRemarks;
  const legacy = props.CasualRemark;
  if (plural?.kind === "array") {
    for (const item of plural.items) {
      if (item.kind !== "ext_ref") continue;
      const id = resolveBalloon(item.id);
      if (id) CasualRemarks.push(id);
    }
  } else if (legacy?.kind === "ext_ref") {
    const id = resolveBalloon(legacy.id);
    if (id) CasualRemarks.push(id);
  }

  return {
    NpcId: npcId,
    DisplayName: valueAsString(props.DisplayName) ?? "",
    MemoryEntryId: valueAsString(props.MemoryEntryId) ?? "",
    Portrait,
    DefaultDialog: resolveDialog(props.DefaultDialog),
    OffendedDialog: resolveDialog(props.OffendedDialog),
    OffendedFlag: valueAsString(props.OffendedFlag) ?? "",
    Quests,
    DeathImpactId: valueAsString(props.DeathImpactId) ?? "",
    DeathImpactIdContextual: valueAsString(props.DeathImpactIdContextual) ?? "",
    ContextualFlag: valueAsString(props.ContextualFlag) ?? "",
    LootTable,
    CasualRemarks,
    DidSpeakFlag: valueAsString(props.DidSpeakFlag) ?? "",
  };
}

// ---- Dialogs ---------------------------------------------------------------

export function mapDialogSequence(parsed: ParsedTres): DialogSequence | null {
  if (parsed.scriptClass !== "DialogSequence") return null;
  const props = parsed.resourceProps;
  const id = valueAsString(props.Id) ?? "";
  if (!id) throw new Error("Id is empty — DialogSequence requires a non-empty Id");

  const Lines = (valueAsArray(props.Lines) ?? [])
    .map((ref): DialogSequence["Lines"][number] | null => {
      const subId = valueAsSubRef(ref);
      if (!subId) return null;
      const lineSub = parsed.subResources.get(subId);
      if (!lineSub) return null;

      let Portrait = "";
      const portraitVal = lineSub.props.Portrait;
      if (portraitVal?.kind === "ext_ref") {
        const ext = parsed.extResources.get(portraitVal.id);
        if (ext && ext.type === "Texture2D" && ext.path) {
          Portrait = resPathToAbs(ext.path);
        }
      }

      const Choices = (valueAsArray(lineSub.props.Choices) ?? [])
        .map((cref): DialogSequence["Lines"][number]["Choices"][number] | null => {
          const cSubId = valueAsSubRef(cref);
          if (!cSubId) return null;
          const cSub = parsed.subResources.get(cSubId);
          if (!cSub) return null;
          return {
            _subId: cSubId,
            Text: valueAsString(cSub.props.Text) ?? "",
            NextSequenceId: valueAsString(cSub.props.NextSequenceId) ?? "",
            SetsFlag: valueAsString(cSub.props.SetsFlag) ?? "",
          };
        })
        .filter((c) => c !== null) as DialogSequence["Lines"][number]["Choices"];

      return {
        _subId: subId,
        SpeakerName: valueAsString(lineSub.props.SpeakerName) ?? "",
        Text: valueAsString(lineSub.props.Text) ?? "",
        Portrait,
        Choices,
      };
    })
    .filter((l) => l !== null) as DialogSequence["Lines"];

  // SourceType: Godot omits the line when the value is 0 (Npc), so default
  // when missing. `enum DialogSourceTypes { Npc, Terminal }`.
  const sourceTypeIdx = valueAsNumber(props.SourceType) ?? 0;
  const SourceType =
    DIALOG_SOURCE_BY_INDEX[sourceTypeIdx] ?? "Npc";

  return {
    Id: id,
    SourceType,
    Lines,
    SetsFlag: valueAsString(props.SetsFlag) ?? "",
  };
}

// ---- Helpers ---------------------------------------------------------------

/** Convert a Godot res:// path to an absolute filesystem path under the
 *  configured Godot project root. Used so AssetThumb can render imported
 *  Texture2D references without the user having to re-pick aseprite paths. */
// ---- Balloons --------------------------------------------------------------

// BalloonLine has no Id property in C# — the Bleepforge Id is the .tres
// filename basename, derived by the caller (orchestrator / watcher) from the
// path. This mapper just pulls out the three authored fields.
export function mapBalloon(
  parsed: ParsedTres,
  basename: string,
): import("@bleepforge/shared").Balloon | null {
  if (parsed.scriptClass !== "BalloonLine") return null;
  const props = parsed.resourceProps;
  return {
    Id: basename,
    Text: valueAsString(props.Text) ?? "",
    TypeSpeed: valueAsNumber(props.TypeSpeed) ?? 30,
    HoldDuration: valueAsNumber(props.HoldDuration) ?? 2.0,
  };
}

export function resPathToAbs(resPath: string, godotRoot?: string): string {
  if (!resPath.startsWith("res://")) return resPath;
  const root = godotRoot ?? process.env.GODOT_PROJECT_ROOT ?? "";
  if (!root) return resPath; // graceful fallback
  // path.join normalizes mixed separators — produces backslashes on Windows
  // from a forward-slash res:// path. The previous string-concat impl
  // produced "C:\\root/foo/bar.png" with mixed separators which broke
  // downstream startsWith/string comparisons.
  return path.join(root, resPath.substring("res://".length));
}

export const ENUM_MAPS = {
  factions: FACTION_BY_INDEX,
  objectiveTypes: OBJECTIVE_TYPE_BY_INDEX,
  rewardTypes: REWARD_TYPE_BY_INDEX,
  itemCategories: ITEM_CATEGORY_BY_INDEX,
};

// Re-export so the orchestrator can pass a hint without picking apart this module.
export type { TresValue };
