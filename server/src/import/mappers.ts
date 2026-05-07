import type { Faction, FactionData, Item, ItemCategory, KarmaImpact, ObjectiveType, Quest, RewardType, DialogSequence } from "@bleepforge/shared";
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
  if (!id) return null;
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
  if (!slug) return null;

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
  if (!id) return null;

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

// ---- Dialogs ---------------------------------------------------------------

export function mapDialogSequence(parsed: ParsedTres): DialogSequence | null {
  if (parsed.scriptClass !== "DialogSequence") return null;
  const props = parsed.resourceProps;
  const id = valueAsString(props.Id) ?? "";
  if (!id) return null;

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

  return {
    Id: id,
    Lines,
    SetsFlag: valueAsString(props.SetsFlag) ?? "",
  };
}

// ---- Helpers ---------------------------------------------------------------

/** Convert a Godot res:// path to an absolute filesystem path under the
 *  configured Godot project root. Used so AssetThumb can render imported
 *  Texture2D references without the user having to re-pick aseprite paths. */
export function resPathToAbs(resPath: string, godotRoot?: string): string {
  if (!resPath.startsWith("res://")) return resPath;
  const root = godotRoot ?? process.env.GODOT_PROJECT_ROOT ?? "";
  if (!root) return resPath; // graceful fallback
  return root.replace(/\/$/, "") + "/" + resPath.substring("res://".length);
}

export const ENUM_MAPS = {
  factions: FACTION_BY_INDEX,
  objectiveTypes: OBJECTIVE_TYPE_BY_INDEX,
  rewardTypes: REWARD_TYPE_BY_INDEX,
  itemCategories: ITEM_CATEGORY_BY_INDEX,
};

// Re-export so the orchestrator can pass a hint without picking apart this module.
export type { TresValue };
