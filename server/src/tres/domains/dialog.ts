import type { Doc, Section } from "../types.js";
import {
  addExtResource,
  buildSubResourceSection,
  getAttrValue,
  insertSectionBefore,
  mintSubResourceId,
  reconcileProperty,
  removeSectionById,
  serializeString,
  serializeSubRefArray,
} from "../mutate.js";

// Optional context for resolving asset UIDs. When set, the mapper will add
// new [ext_resource] blocks for portrait textures the .tres doesn't yet
// reference, and for the DialogChoice.cs script when adding the first
// choice to a sequence that has none. Without ctx, such cases warn and
// leave the .tres unchanged.
export interface DialogApplyContext {
  godotRoot: string;
  resolveTextureUid(absPath: string): string | null;
  resolveDialogChoiceScriptUid(): string | null;
}

// Maps Bleepforge's DialogSequence JSON onto a parsed .tres.
//
// Scope as of Phase B3:
//   - Main [resource] scalars: Id, SetsFlag
//   - Line sub_resource scalars: SpeakerName, Text
//   - Choice sub_resource scalars: Text, NextSequenceId, SetsFlag
//   - **Trailing line removal/append**, with orphan choice cleanup on remove
//     and matching choice creation on append.
//   - **Trailing choice removal/append within existing lines**: mints new
//     choice sub_resources (placed before their parent line for topological
//     order) and updates the line's Choices property.
//
// Still deferred:
//   - Middle-insert / reorder lines or choices
//   - Portrait change (requires possible ExtResource addition)
//   - Adding the FIRST choice to a sequence that has none (would require
//     a new DialogChoice.cs ext_resource block)

export const SEQUENCE_FIELD_ORDER: readonly string[] = [
  "script",
  "Id",
  "Lines",
  "SetsFlag",
  "metadata/_custom_type_script",
];

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

export interface DialogChoiceJson {
  Text: string;
  NextSequenceId: string;
  SetsFlag: string;
}

export interface DialogLineJson {
  SpeakerName: string;
  Text: string;
  Portrait: string;
  Choices: DialogChoiceJson[];
}

export interface DialogSequenceJson {
  Id: string;
  Lines: DialogLineJson[];
  SetsFlag: string;
}

type Action = "updated" | "inserted" | "removed" | "noop";

export interface DialogApplyResult {
  resourceActions: { key: string; action: Action }[];
  lines: {
    index: number;
    subId: string;
    actions: { key: string; action: Action }[];
    choices: { index: number; subId: string; actions: { key: string; action: Action }[] }[];
    choicesRemoved: { index: number; subId: string }[];
    choicesAdded: { index: number; subId: string }[];
  }[];
  linesRemoved: { index: number; subId: string; orphanChoiceIds: string[] }[];
  linesAdded: { index: number; subId: string; choiceSubIds: string[] }[];
  warnings: string[];
}

const DIALOG_LINE_SCRIPT_PATH = "res://shared/components/dialog/DialogLine.cs";
const DIALOG_CHOICE_SCRIPT_PATH = "res://shared/components/dialog/DialogChoice.cs";

export function applyDialog(
  doc: Doc,
  json: DialogSequenceJson,
  ctx?: DialogApplyContext,
): DialogApplyResult {
  const warnings: string[] = [];
  const resourceSection = doc.sections.find((s) => s.kind === "resource");
  if (!resourceSection) {
    warnings.push("no [resource] section");
    return { resourceActions: [], lines: [], linesRemoved: [], linesAdded: [], warnings };
  }

  // Snapshot existing line sub_ids so we know which to keep/drop. We compute
  // structural deltas first, then scalar-reconcile the surviving range.
  const originalLineSubIds = extractRefArray(resourceSection, "Lines");
  const finalLineSubIds = [...originalLineSubIds];
  const linesRemoved: DialogApplyResult["linesRemoved"] = [];
  const linesAdded: DialogApplyResult["linesAdded"] = [];

  // ---- Structural: trailing line removal ----
  if (json.Lines.length < originalLineSubIds.length) {
    for (let i = originalLineSubIds.length - 1; i >= json.Lines.length; i--) {
      const subId = originalLineSubIds[i]!;
      const lineSection = findSubResourceById(doc, subId);
      const orphanChoiceIds = lineSection ? extractRefArray(lineSection, "Choices") : [];
      removeSectionById(doc, "sub_resource", subId);
      for (const cid of orphanChoiceIds) {
        removeSectionById(doc, "sub_resource", cid);
      }
      finalLineSubIds.pop();
      linesRemoved.unshift({ index: i, subId, orphanChoiceIds });
    }
  }

  // ---- Structural: trailing line append ----
  if (json.Lines.length > originalLineSubIds.length) {
    const dialogLineExt = findScriptExtResource(doc, DIALOG_LINE_SCRIPT_PATH);
    if (!dialogLineExt) {
      warnings.push(
        `cannot append lines: DialogLine.cs ext_resource not found in this .tres (path: ${DIALOG_LINE_SCRIPT_PATH})`,
      );
    } else {
      const dialogChoiceExt = ensureDialogChoiceExtResource(doc, ctx, warnings);
      for (let i = originalLineSubIds.length; i < json.Lines.length; i++) {
        const lj = json.Lines[i]!;
        const portraitExtId =
          lj.Portrait === ""
            ? null
            : ensureTextureExtResource(doc, lj.Portrait, ctx, `appended line ${i}`, warnings);

        // Build choice sub_resources first (topological order: choices before
        // their referencing line). Skip if DialogChoice.cs ext_resource is
        // missing — adding it is structural for ext_resources, deferred.
        const newChoiceSubIds: string[] = [];
        if (lj.Choices.length > 0) {
          if (!dialogChoiceExt) {
            warnings.push(
              `appended line ${i}: ${lj.Choices.length} choices skipped — DialogChoice.cs ext_resource not present in this .tres`,
            );
          } else {
            for (const cj of lj.Choices) {
              const choiceId = mintSubResourceId(doc);
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

        // Build the line sub_resource itself.
        const subId = mintSubResourceId(doc);
        const properties: { key: string; rawValue: string }[] = [
          { key: "script", rawValue: `ExtResource("${dialogLineExt.id}")` },
        ];
        if (lj.SpeakerName !== "") {
          properties.push({ key: "SpeakerName", rawValue: serializeString(lj.SpeakerName) });
        }
        if (lj.Text !== "") {
          properties.push({ key: "Text", rawValue: serializeString(lj.Text) });
        }
        if (portraitExtId) {
          properties.push({ key: "Portrait", rawValue: `ExtResource("${portraitExtId}")` });
        }
        if (newChoiceSubIds.length > 0) {
          properties.push({
            key: "Choices",
            rawValue: serializeSubRefArray(newChoiceSubIds),
          });
        }
        properties.push({
          key: "metadata/_custom_type_script",
          rawValue: serializeString(dialogLineExt.uid),
        });
        const newSection = buildSubResourceSection({
          type: "Resource",
          id: subId,
          properties,
        });
        insertSectionBefore(doc, "resource", newSection);
        finalLineSubIds.push(subId);
        linesAdded.push({ index: i, subId, choiceSubIds: newChoiceSubIds });
      }
    }
  }

  // ---- Update the Lines array property to reflect structural changes ----
  if (finalLineSubIds.length !== originalLineSubIds.length) {
    const linesAction = reconcileProperty(
      resourceSection,
      "Lines",
      finalLineSubIds.length === 0 ? null : serializeSubRefArray(finalLineSubIds),
      SEQUENCE_FIELD_ORDER,
    );
    // The reconcile result is bookkept in resourceActions below as part of
    // the main pass.
    void linesAction;
  }

  // ---- Main [resource] scalars ----
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
      key: "SetsFlag",
      action: reconcileProperty(
        resourceSection,
        "SetsFlag",
        json.SetsFlag === "" ? null : serializeString(json.SetsFlag),
        SEQUENCE_FIELD_ORDER,
      ),
    },
  ];

  // ---- Per-line scalars on the surviving range ----
  const lines: DialogApplyResult["lines"] = [];
  const commonCount = Math.min(json.Lines.length, finalLineSubIds.length);
  for (let i = 0; i < commonCount; i++) {
    const subId = finalLineSubIds[i]!;
    const lineSection = findSubResourceById(doc, subId);
    if (!lineSection) {
      warnings.push(`line sub_resource ${subId} referenced but not declared`);
      continue;
    }
    const lj = json.Lines[i]!;
    const portraitExtId =
      lj.Portrait === ""
        ? null
        : ensureTextureExtResource(doc, lj.Portrait, ctx, `line ${i}`, warnings);
    const actions: { key: string; action: Action }[] = [
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
    // Portrait — only reconcile when we have something concrete (clear or
    // resolved ext id). When set-but-unresolvable, leave the line's existing
    // Portrait property untouched (warning already emitted).
    let portraitAction: Action = "noop";
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

    // ---- Structural: choice removal/append within this line ----
    const originalChoiceSubIds = extractRefArray(lineSection, "Choices");
    const finalChoiceSubIds = [...originalChoiceSubIds];
    const choicesRemoved: { index: number; subId: string }[] = [];
    const choicesAdded: { index: number; subId: string }[] = [];

    if (lj.Choices.length < originalChoiceSubIds.length) {
      for (let j = originalChoiceSubIds.length - 1; j >= lj.Choices.length; j--) {
        const cid = originalChoiceSubIds[j]!;
        removeSectionById(doc, "sub_resource", cid);
        finalChoiceSubIds.pop();
        choicesRemoved.unshift({ index: j, subId: cid });
      }
    }

    if (lj.Choices.length > originalChoiceSubIds.length) {
      const dialogChoiceExt = ensureDialogChoiceExtResource(doc, ctx, warnings);
      if (!dialogChoiceExt) {
        warnings.push(
          `line ${i}: cannot append choices — DialogChoice.cs ext_resource not present in this .tres`,
        );
      } else {
        for (let j = originalChoiceSubIds.length; j < lj.Choices.length; j++) {
          const cj = lj.Choices[j]!;
          const cid = mintSubResourceId(doc);
          const choiceSection = buildChoiceSubResource(
            cj,
            dialogChoiceExt.id,
            dialogChoiceExt.uid,
            cid,
          );
          // Insert before the parent line's sub_resource (topological order).
          insertSectionBefore(doc, lineSection, choiceSection);
          finalChoiceSubIds.push(cid);
          choicesAdded.push({ index: j, subId: cid });
        }
      }
    }

    // Update the line's Choices property to reflect structural changes.
    if (finalChoiceSubIds.length !== originalChoiceSubIds.length) {
      reconcileProperty(
        lineSection,
        "Choices",
        finalChoiceSubIds.length === 0 ? null : serializeSubRefArray(finalChoiceSubIds),
        LINE_FIELD_ORDER,
      );
    }

    // ---- Per-choice scalars on the surviving range ----
    const choices: DialogApplyResult["lines"][number]["choices"] = [];
    const commonChoiceCount = Math.min(lj.Choices.length, finalChoiceSubIds.length);
    for (let j = 0; j < commonChoiceCount; j++) {
      const cSubId = finalChoiceSubIds[j]!;
      const choiceSection = findSubResourceById(doc, cSubId);
      if (!choiceSection) {
        warnings.push(`choice sub_resource ${cSubId} referenced but not declared`);
        continue;
      }
      const cj = lj.Choices[j]!;
      const cActions: { key: string; action: Action }[] = [
        {
          key: "Text",
          action: reconcileProperty(
            choiceSection,
            "Text",
            cj.Text === "" ? null : serializeString(cj.Text),
            CHOICE_FIELD_ORDER,
          ),
        },
        {
          key: "NextSequenceId",
          action: reconcileProperty(
            choiceSection,
            "NextSequenceId",
            cj.NextSequenceId === "" ? null : serializeString(cj.NextSequenceId),
            CHOICE_FIELD_ORDER,
          ),
        },
        {
          key: "SetsFlag",
          action: reconcileProperty(
            choiceSection,
            "SetsFlag",
            cj.SetsFlag === "" ? null : serializeString(cj.SetsFlag),
            CHOICE_FIELD_ORDER,
          ),
        },
      ];
      choices.push({ index: j, subId: cSubId, actions: cActions });
    }
    lines.push({ index: i, subId, actions, choices, choicesRemoved, choicesAdded });
  }

  return { resourceActions, lines, linesRemoved, linesAdded, warnings };
}

// Backwards-compatible alias for callers that imported the Phase A name.
export const applyDialogScalars = applyDialog;

// ---- Helpers ---------------------------------------------------------------

// Returns the {id, uid} of the DialogChoice.cs script ext_resource, adding
// a new ext_resource block if needed. Returns null if the script can't be
// resolved (no existing ref AND no ctx UID lookup).
function ensureDialogChoiceExtResource(
  doc: Doc,
  ctx: DialogApplyContext | undefined,
  warnings: string[],
): { id: string; uid: string } | null {
  const existing = findScriptExtResource(doc, DIALOG_CHOICE_SCRIPT_PATH);
  if (existing) return existing;
  if (!ctx) {
    warnings.push(
      `DialogChoice.cs ext_resource not present and no resolution context — choice operations skipped`,
    );
    return null;
  }
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

// Returns the ext_resource id for a texture's absolute path, adding a new
// ext_resource block if needed. Returns null if the texture can't be
// resolved (no existing ref AND no UID lookup succeeded).
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
  // Look for an existing ext_resource by res:// path.
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== "Texture2D") continue;
    if (getAttrValue(s, "path") !== resPath) continue;
    const id = getAttrValue(s, "id");
    if (id) return id;
  }
  // Add a new ext_resource using the asset's actual UID.
  const uid = ctx.resolveTextureUid(absPath);
  if (!uid) {
    warnings.push(
      `${contextLabel}: Portrait "${absPath}" — no .import sidecar found, can't resolve UID`,
    );
    return null;
  }
  return addExtResource(doc, { type: "Texture2D", uid, path: resPath });
}

function absToResPath(godotRoot: string, absPath: string): string | null {
  const root = godotRoot.replace(/\/$/, "");
  if (!absPath.startsWith(root + "/")) return null;
  return "res://" + absPath.substring(root.length + 1);
}

// Builds a fresh DialogChoice sub_resource section from JSON. Field order
// matches Godot's: script, Text, NextSequenceId, SetsFlag, metadata. Default
// values are omitted (per Godot's writer convention).
function buildChoiceSubResource(
  json: DialogChoiceJson,
  scriptExtId: string,
  scriptUid: string,
  subId: string,
): Section {
  const properties: { key: string; rawValue: string }[] = [
    { key: "script", rawValue: `ExtResource("${scriptExtId}")` },
  ];
  if (json.Text !== "") {
    properties.push({ key: "Text", rawValue: serializeString(json.Text) });
  }
  if (json.NextSequenceId !== "") {
    properties.push({
      key: "NextSequenceId",
      rawValue: serializeString(json.NextSequenceId),
    });
  }
  if (json.SetsFlag !== "") {
    properties.push({ key: "SetsFlag", rawValue: serializeString(json.SetsFlag) });
  }
  properties.push({
    key: "metadata/_custom_type_script",
    rawValue: serializeString(scriptUid),
  });
  return buildSubResourceSection({ type: "Resource", id: subId, properties });
}

// Locates an [ext_resource] of type Script with a given res:// path. Returns
// its id and uid (both required for building a new sub_resource that points
// at this script).
function findScriptExtResource(
  doc: Doc,
  resPath: string,
): { id: string; uid: string } | null {
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    const type = getAttrValue(s, "type");
    const path = getAttrValue(s, "path");
    if (type !== "Script" || path !== resPath) continue;
    const id = getAttrValue(s, "id");
    const uid = getAttrValue(s, "uid");
    if (id && uid) return { id, uid };
  }
  return null;
}

function findSubResourceById(doc: Doc, id: string): Section | undefined {
  return doc.sections.find(
    (s) => s.kind === "sub_resource" && getAttrValue(s, "id") === id,
  );
}

// Reads the SubResource ids referenced by a property's array value, in
// source order. Value text shape: `[SubResource("X"), SubResource("Y")]`.
function extractRefArray(section: Section, key: string): string[] {
  const entry = section.body.find((e) => e.kind === "property" && e.key === key);
  if (!entry || entry.kind !== "property") return [];
  const ids: string[] = [];
  const re = /SubResource\("([^"]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry.rawAfterEquals)) !== null) {
    ids.push(m[1]!);
  }
  return ids;
}
