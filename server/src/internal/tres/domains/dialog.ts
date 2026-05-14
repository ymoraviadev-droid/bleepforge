import path from "node:path";
import type { Doc, Section } from "../types.js";
import {
  addExtResource,
  buildSubResourceSection,
  extractRefArray,
  findSubResourceById,
  getAttrValue,
  insertSectionBefore,
  reconcileProperty,
  reconcileSubResourceArray,
  removeSectionById,
  serializeEnumInt,
  serializeString,
  type ReconcileAction,
  type SubArrayReconcileResult,
} from "../mutate.js";

// DialogSequence mapper. Now id-aware via `_subId`. Lines and choices match
// across reorder, add, update, remove. The shape:
//
//   sequence.Lines[i]._subId       -> line sub_resource id
//   sequence.Lines[i].Choices[j]._subId -> choice sub_resource id
//
// Optional context (`ctx`) provides UID resolvers for new ext_resources:
// portrait textures and the DialogChoice.cs script.

export interface DialogApplyContext {
  godotRoot: string;
  resolveTextureUid(absPath: string): string | null;
  resolveDialogChoiceScriptUid(): string | null;
}

export const SEQUENCE_FIELD_ORDER: readonly string[] = [
  "script",
  "Id",
  "SourceType",
  "Lines",
  "SetsFlag",
  "metadata/_custom_type_script",
];

// Mirrors the C# `enum DialogSourceTypes { Npc, Terminal }`. Same trick as
// every other enum in the project: omit the line when the value is the
// 0-default (Godot's behavior on save).
const DIALOG_SOURCE_TO_INT: Record<string, number> = {
  Npc: 0,
  Terminal: 1,
};

export const LINE_FIELD_ORDER: readonly string[] = [
  "script",
  "SpeakerName",
  "Text",
  "Portrait",
  "Choices",
  "metadata/_custom_type_script",
];

export const CHOICE_FIELD_ORDER: readonly string[] = [
  "script",
  "Text",
  "NextSequenceId",
  "SetsFlag",
  "metadata/_custom_type_script",
];

const DIALOG_LINE_SCRIPT_PATH = "res://shared/components/dialog/DialogLine.cs";
const DIALOG_CHOICE_SCRIPT_PATH = "res://shared/components/dialog/DialogChoice.cs";

export interface DialogChoiceJson {
  _subId?: string;
  Text: string;
  NextSequenceId: string;
  SetsFlag: string;
}

export interface DialogLineJson {
  _subId?: string;
  SpeakerName: string;
  Text: string;
  Portrait: string;
  Choices: DialogChoiceJson[];
}

export interface DialogSequenceJson {
  Id: string;
  SourceType: string;
  Lines: DialogLineJson[];
  SetsFlag: string;
}

export interface DialogApplyResult {
  resourceActions: { key: string; action: ReconcileAction }[];
  linesUpdated: SubArrayReconcileResult["updated"];
  linesAdded: SubArrayReconcileResult["added"];
  linesRemoved: SubArrayReconcileResult["removed"];
  // Per-line choice changes, keyed by line subId.
  choicesByLine: Map<string, SubArrayReconcileResult>;
  warnings: string[];
}

export function applyDialog(
  doc: Doc,
  json: DialogSequenceJson,
  ctx?: DialogApplyContext,
): DialogApplyResult {
  const warnings: string[] = [];
  const resourceSection = doc.sections.find((s) => s.kind === "resource");
  if (!resourceSection) {
    warnings.push("no [resource] section");
    return {
      resourceActions: [],
      linesUpdated: [],
      linesAdded: [],
      linesRemoved: [],
      choicesByLine: new Map(),
      warnings,
    };
  }

  const dialogLineExt = findScriptExtResource(doc, DIALOG_LINE_SCRIPT_PATH);
  const choicesByLine = new Map<string, SubArrayReconcileResult>();

  const linesResult = reconcileSubResourceArray(
    doc,
    resourceSection,
    "Lines",
    SEQUENCE_FIELD_ORDER,
    json.Lines,
    {
      reconcileExisting: (lineSection, lj) => {
        const actions = reconcileLineScalars(doc, lineSection, lj, ctx, warnings);
        // Recursively reconcile choices on this line.
        const cResult = reconcileChoicesOnLine(doc, lineSection, lj, ctx, warnings);
        const lineSubId = getAttrValue(lineSection, "id")!;
        choicesByLine.set(lineSubId, cResult);
        return actions;
      },
      buildNew: (lj, subId) => {
        if (!dialogLineExt) {
          warnings.push(
            `cannot append line: DialogLine.cs ext_resource not present in this .tres`,
          );
          return null;
        }
        const result = buildLineWithChoices(doc, lj, dialogLineExt, subId, ctx, warnings);
        if (result.choicesResult) choicesByLine.set(subId, result.choicesResult);
        return result.section;
      },
      insertBefore: "resource",
      onRemove: (subId) => {
        const lineSection = findSubResourceById(doc, subId);
        if (!lineSection) return;
        const orphanChoiceIds = extractRefArray(lineSection, "Choices");
        for (const cid of orphanChoiceIds) {
          removeSectionById(doc, "sub_resource", cid);
        }
      },
    },
  );

  const resourceActions: DialogApplyResult["resourceActions"] = [
    {
      key: "Id",
      action: reconcileProperty(
        resourceSection,
        "Id",
        serializeString(json.Id),
        SEQUENCE_FIELD_ORDER,
      ),
    },
    {
      key: "SourceType",
      action: reconcileProperty(
        resourceSection,
        "SourceType",
        // Default Npc=0 is omitted by Godot, so we omit too. Anything else
        // emits as the C# enum int.
        json.SourceType === "Npc"
          ? null
          : serializeEnumInt(json.SourceType, DIALOG_SOURCE_TO_INT),
        SEQUENCE_FIELD_ORDER,
      ),
    },
    {
      key: "SetsFlag",
      action: reconcileProperty(
        resourceSection,
        "SetsFlag",
        json.SetsFlag === "" ? null : serializeString(json.SetsFlag),
        SEQUENCE_FIELD_ORDER,
      ),
    },
  ];

  return {
    resourceActions,
    linesUpdated: linesResult.updated,
    linesAdded: linesResult.added,
    linesRemoved: linesResult.removed,
    choicesByLine,
    warnings,
  };
}

// Backwards-compatible alias.
export const applyDialogScalars = applyDialog;

// ---- Per-line reconciliation ----------------------------------------------

function reconcileLineScalars(
  doc: Doc,
  lineSection: Section,
  lj: DialogLineJson,
  ctx: DialogApplyContext | undefined,
  warnings: string[],
): { key: string; action: ReconcileAction }[] {
  const portraitExtId =
    lj.Portrait === ""
      ? null
      : ensureTextureExtResource(doc, lj.Portrait, ctx, "line", warnings);
  const actions: { key: string; action: ReconcileAction }[] = [
    {
      key: "SpeakerName",
      action: reconcileProperty(
        lineSection,
        "SpeakerName",
        lj.SpeakerName === "" ? null : serializeString(lj.SpeakerName),
        LINE_FIELD_ORDER,
      ),
    },
    {
      key: "Text",
      action: reconcileProperty(
        lineSection,
        "Text",
        lj.Text === "" ? null : serializeString(lj.Text),
        LINE_FIELD_ORDER,
      ),
    },
  ];
  let portraitAction: ReconcileAction = "noop";
  if (lj.Portrait === "") {
    portraitAction = reconcileProperty(lineSection, "Portrait", null, LINE_FIELD_ORDER);
  } else if (portraitExtId) {
    portraitAction = reconcileProperty(
      lineSection,
      "Portrait",
      `ExtResource("${portraitExtId}")`,
      LINE_FIELD_ORDER,
    );
  }
  actions.push({ key: "Portrait", action: portraitAction });
  return actions;
}

function reconcileChoicesOnLine(
  doc: Doc,
  lineSection: Section,
  lj: DialogLineJson,
  ctx: DialogApplyContext | undefined,
  warnings: string[],
): SubArrayReconcileResult {
  // Lazy-resolve DialogChoice.cs only when a new choice actually needs to
  // be built. Lines without choice mutations skip the lookup (and any
  // warning it might emit) entirely.
  let cached: { id: string; uid: string } | null | undefined = undefined;
  const ensure = (): { id: string; uid: string } | null => {
    if (cached === undefined) {
      cached = ensureDialogChoiceExtResource(doc, ctx, warnings);
    }
    return cached;
  };
  return reconcileSubResourceArray(
    doc,
    lineSection,
    "Choices",
    LINE_FIELD_ORDER,
    lj.Choices,
    {
      reconcileExisting: (choiceSection, cj) => reconcileChoiceScalars(choiceSection, cj),
      buildNew: (cj, subId) => {
        const ext = ensure();
        if (!ext) return null;
        return buildChoiceSubResource(cj, ext.id, ext.uid, subId);
      },
      // Choices land before the parent line for topological order.
      insertBefore: lineSection,
    },
  );
}

function reconcileChoiceScalars(
  section: Section,
  cj: DialogChoiceJson,
): { key: string; action: ReconcileAction }[] {
  return [
    {
      key: "Text",
      action: reconcileProperty(
        section,
        "Text",
        cj.Text === "" ? null : serializeString(cj.Text),
        CHOICE_FIELD_ORDER,
      ),
    },
    {
      key: "NextSequenceId",
      action: reconcileProperty(
        section,
        "NextSequenceId",
        cj.NextSequenceId === "" ? null : serializeString(cj.NextSequenceId),
        CHOICE_FIELD_ORDER,
      ),
    },
    {
      key: "SetsFlag",
      action: reconcileProperty(
        section,
        "SetsFlag",
        cj.SetsFlag === "" ? null : serializeString(cj.SetsFlag),
        CHOICE_FIELD_ORDER,
      ),
    },
  ];
}

// ---- Builders for new sub_resources ---------------------------------------

function buildLineWithChoices(
  doc: Doc,
  lj: DialogLineJson,
  scriptExt: { id: string; uid: string },
  subId: string,
  ctx: DialogApplyContext | undefined,
  warnings: string[],
): { section: Section; choicesResult: SubArrayReconcileResult | null } {
  const portraitExtId =
    lj.Portrait === ""
      ? null
      : ensureTextureExtResource(doc, lj.Portrait, ctx, `appended line`, warnings);

  // Build choice sub_resources first (topologically before the new line) and
  // collect their ids to fill the line's Choices array.
  let newChoiceSubIds: string[] = [];
  if (lj.Choices.length > 0) {
    const dialogChoiceExt = ensureDialogChoiceExtResource(doc, ctx, warnings);
    if (!dialogChoiceExt) {
      warnings.push(
        `appended line: ${lj.Choices.length} choices skipped (DialogChoice.cs unavailable)`,
      );
    } else {
      for (const cj of lj.Choices) {
        const choiceId = cj._subId ?? mintNonCollidingSubId(doc);
        const choiceSection = buildChoiceSubResource(
          cj,
          dialogChoiceExt.id,
          dialogChoiceExt.uid,
          choiceId,
        );
        insertSectionBefore(doc, "resource", choiceSection);
        newChoiceSubIds.push(choiceId);
      }
    }
  }

  const properties: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExt.id}")` },
  ];
  if (lj.SpeakerName !== "")
    properties.push({ key: "SpeakerName", rawValue: serializeString(lj.SpeakerName) });
  if (lj.Text !== "")
    properties.push({ key: "Text", rawValue: serializeString(lj.Text) });
  if (portraitExtId)
    properties.push({ key: "Portrait", rawValue: `ExtResource("${portraitExtId}")` });
  if (newChoiceSubIds.length > 0)
    properties.push({
      key: "Choices",
      rawValue: serializeSubRefArrayLocal(newChoiceSubIds),
    });
  properties.push({
    key: "metadata/_custom_type_script",
    rawValue: serializeString(scriptExt.uid),
  });

  const section = buildSubResourceSection({ type: "Resource", id: subId, properties });
  return { section, choicesResult: null };
}

function buildChoiceSubResource(
  cj: DialogChoiceJson,
  scriptExtId: string,
  scriptUid: string,
  subId: string,
): Section {
  const properties: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExtId}")` },
  ];
  if (cj.Text !== "")
    properties.push({ key: "Text", rawValue: serializeString(cj.Text) });
  if (cj.NextSequenceId !== "")
    properties.push({
      key: "NextSequenceId",
      rawValue: serializeString(cj.NextSequenceId),
    });
  if (cj.SetsFlag !== "")
    properties.push({ key: "SetsFlag", rawValue: serializeString(cj.SetsFlag) });
  properties.push({
    key: "metadata/_custom_type_script",
    rawValue: serializeString(scriptUid),
  });
  return buildSubResourceSection({ type: "Resource", id: subId, properties });
}

// ---- Ext-resource helpers -------------------------------------------------

function ensureDialogChoiceExtResource(
  doc: Doc,
  ctx: DialogApplyContext | undefined,
  warnings: string[],
): { id: string; uid: string } | null {
  const existing = findScriptExtResource(doc, DIALOG_CHOICE_SCRIPT_PATH);
  if (existing) return existing;
  if (!ctx) return null;
  const uid = ctx.resolveDialogChoiceScriptUid();
  if (!uid) {
    warnings.push(
      `DialogChoice.cs ext_resource not present and uid lookup failed — choice operations skipped`,
    );
    return null;
  }
  const id = addExtResource(doc, {
    type: "Script",
    uid,
    path: DIALOG_CHOICE_SCRIPT_PATH,
  });
  return { id, uid };
}

function ensureTextureExtResource(
  doc: Doc,
  absPath: string,
  ctx: DialogApplyContext | undefined,
  contextLabel: string,
  warnings: string[],
): string | null {
  if (!ctx) {
    warnings.push(
      `${contextLabel}: Portrait set to "${absPath}" but no resolution context — Portrait left unchanged`,
    );
    return null;
  }
  const resPath = absToResPath(ctx.godotRoot, absPath);
  if (!resPath) {
    warnings.push(
      `${contextLabel}: Portrait absolute path "${absPath}" is not under godotRoot — Portrait left unchanged`,
    );
    return null;
  }
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== "Texture2D") continue;
    if (getAttrValue(s, "path") !== resPath) continue;
    const id = getAttrValue(s, "id");
    if (id) return id;
  }
  const uid = ctx.resolveTextureUid(absPath);
  if (!uid) {
    warnings.push(
      `${contextLabel}: Portrait "${absPath}" — no .import sidecar found, can't resolve UID`,
    );
    return null;
  }
  return addExtResource(doc, { type: "Texture2D", uid, path: resPath });
}

function findScriptExtResource(
  doc: Doc,
  resPath: string,
): { id: string; uid: string } | null {
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== "Script") continue;
    if (getAttrValue(s, "path") !== resPath) continue;
    const id = getAttrValue(s, "id");
    const uid = getAttrValue(s, "uid");
    if (id && uid) return { id, uid };
  }
  return null;
}

function absToResPath(godotRoot: string, absPath: string): string | null {
  // Use path.relative + replaceAll(path.sep, "/") so the conversion works
  // on Windows — see textureRef.ts for the rationale (same fix, same bug).
  // Godot res:// paths are always forward-slashed regardless of host OS.
  const rel = path.relative(godotRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `res://${rel.replaceAll(path.sep, "/")}`;
}

// Local copy of mintSubResourceId for use inside buildLineWithChoices, where
// a JSON choice may already have a _subId we want to honor.
function mintNonCollidingSubId(doc: Doc): string {
  const existing = new Set<string>();
  for (const s of doc.sections) {
    if (s.kind !== "sub_resource") continue;
    const id = getAttrValue(s, "id");
    if (id) existing.add(id);
  }
  for (let attempt = 0; attempt < 1000; attempt++) {
    const suffix = Math.random().toString(36).substring(2, 7);
    const candidate = `Resource_${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("mintNonCollidingSubId: exhausted attempts");
}

function serializeSubRefArrayLocal(ids: readonly string[]): string {
  if (ids.length === 0) return "[]";
  return "[" + ids.map((id) => `SubResource("${id}")`).join(", ") + "]";
}
