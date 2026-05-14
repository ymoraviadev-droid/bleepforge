// Reconciles a Texture2D-like property (Icon, Banner, Portrait, …) on a
// resource section, given an absolute filesystem path from Bleepforge JSON.
//
// The non-obvious case — and the reason this lives in its own helper — is
// that some Bleepforge-tracked Texture fields can be either:
//
//   1. a `Texture2D` ext_resource (file path) — the case Bleepforge authors,
//   2. an `AtlasTexture` sub_resource (region of a sprite sheet) — Godot-only
//      content that Bleepforge does NOT author. Importer drops these and
//      gives JSON an empty string for the field.
//
// If we naively turned "empty JSON → remove the line", we'd destroy the
// user's hand-crafted AtlasTexture sub_resource on every save. So when the
// JSON is empty we look at what the .tres currently holds:
//   - Texture2D ExtResource → user cleared the icon → remove the line.
//   - SubResource (AtlasTexture) → preserve, this is Godot-only content.
//   - Absent → no-op.
//
// Items (Icon) hit this path concretely — 6 of the 7 items in the Flock of
// Bleeps corpus use AtlasTexture icons. Factions (Icon + Banner) all use
// Texture2D, so the simple swap path is the common one there.

import path from "node:path";
import {
  addExtResource,
  getAttrValue,
  reconcileProperty,
  removeSectionById,
} from "./mutate.js";
import type { Doc, Section } from "./types.js";

export interface TextureRefContext {
  godotRoot: string;
  /** Resolve a texture's Godot UID from its absolute filesystem path. The
   *  caller pre-resolves these (via readTextureUid against the .png.import
   *  sidecar) so this stays synchronous. Null = unknown / sidecar missing. */
  resolveTextureUid(absPath: string): string | null;
}

export interface TextureFieldResult {
  /** "updated" / "inserted" / "removed" / "noop" — same vocabulary as
   *  reconcileProperty. "preserved" is the AtlasTexture case where we
   *  intentionally left a SubResource line alone. */
  action: "updated" | "inserted" | "removed" | "noop" | "preserved";
  warnings: string[];
}

export function reconcileTextureField(
  doc: Doc,
  section: Section,
  key: string,
  fieldOrder: readonly string[],
  jsonAbsPath: string,
  ctx: TextureRefContext,
  contextLabel: string,
): TextureFieldResult {
  const warnings: string[] = [];

  // What does the .tres currently say for this key?
  const existing = section.body.find(
    (e) => e.kind === "property" && e.key === key,
  );
  const existingRaw =
    existing && existing.kind === "property" ? existing.rawAfterEquals.trim() : null;
  const existingIsSubResource =
    existingRaw !== null && /^SubResource\(/.test(existingRaw);

  if (jsonAbsPath === "") {
    // JSON cleared. Only remove the .tres line if it's a Texture2D ExtRef
    // (or already absent). If it's a SubResource (AtlasTexture), preserve —
    // Bleepforge didn't author it and shouldn't blow it away on save.
    if (existingIsSubResource) {
      return { action: "preserved", warnings };
    }
    const action = reconcileProperty(section, key, null, fieldOrder);
    return { action, warnings };
  }

  // JSON has a path → convert to res:// and ensure a Texture2D ext_resource.
  const resPath = absToResPath(ctx.godotRoot, jsonAbsPath);
  if (!resPath) {
    warnings.push(
      `${contextLabel}: ${key} absolute path "${jsonAbsPath}" is not under godotRoot — left unchanged`,
    );
    return { action: "noop", warnings };
  }

  // Reuse an existing Texture2D ext_resource at this path, or add one.
  let extId: string | null = null;
  for (const s of doc.sections) {
    if (s.kind !== "ext_resource") continue;
    if (getAttrValue(s, "type") !== "Texture2D") continue;
    if (getAttrValue(s, "path") !== resPath) continue;
    extId = getAttrValue(s, "id") ?? null;
    if (extId) break;
  }
  if (!extId) {
    const uid = ctx.resolveTextureUid(jsonAbsPath);
    if (!uid) {
      warnings.push(
        `${contextLabel}: ${key} "${jsonAbsPath}" — no .import sidecar UID available, left unchanged`,
      );
      return { action: "noop", warnings };
    }
    extId = addExtResource(doc, { type: "Texture2D", uid, path: resPath });
  }

  const newRaw = `ExtResource("${extId}")`;
  const action = reconcileProperty(section, key, newRaw, fieldOrder);

  // If we just replaced an AtlasTexture SubResource ref with a Texture2D
  // ExtResource, the AtlasTexture sub_resource is now orphaned. Remove it
  // so the file doesn't accumulate dead blocks (and so its `atlas =
  // ExtResource(...)` ref releases for the orphan-ext-resource cleanup pass
  // that runs at the end of every save).
  //
  // Only AtlasTexture is auto-removed here. Other sub_resource types (plain
  // Resource subclasses, etc.) might be referenced elsewhere in the file
  // and need explicit handling by the domain mapper.
  if (existingIsSubResource && (action === "updated" || action === "noop")) {
    const m = existingRaw!.match(/^SubResource\("([^"]+)"\)/);
    const subId = m ? m[1]! : null;
    if (subId) {
      const sub = doc.sections.find(
        (s) => s.kind === "sub_resource" && getAttrValue(s, "id") === subId,
      );
      if (sub && getAttrValue(sub, "type") === "AtlasTexture") {
        removeSectionById(doc, "sub_resource", subId);
      }
    }
  }

  return { action, warnings };
}

function absToResPath(godotRoot: string, absPath: string): string | null {
  // Use path.relative + replaceAll(path.sep, "/") so the conversion works
  // on Windows: the previous root.replace + string.substring + concat impl
  // produced "res://foo\\bar.png" with backslashes (invalid res://) and
  // also failed the startsWith check entirely because Windows roots have
  // backslashes while the original code appended "/". Godot res:// paths
  // are always forward-slashed regardless of host OS.
  const rel = path.relative(godotRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `res://${rel.replaceAll(path.sep, "/")}`;
}
