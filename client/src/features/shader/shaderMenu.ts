import {
  type ContextMenuItem,
  showContextMenu,
} from "../../components/ContextMenu";
import { showConfirm, showPrompt } from "../../components/Modal";
import { pushToast } from "../../components/Toast";
import { shadersApi, type ShaderAsset } from "../../lib/api";
import { buildShaderEditUrl } from "./format";

// Right-click menu for shader cards / rows. Mirrors the asset menu's
// shape but with a fixed surface set — every shader card is a "manage
// this shader" affordance (we don't show shader thumbs anywhere else in
// the app the way images appear on NPC cards / item cards), so the
// canManage / canEdit split that the asset menu carries doesn't apply.
// Every right-click on a shader gets the same four items: Open, Duplicate,
// Delete, Show usages.

export interface ShaderMenuOptions {
  asset: ShaderAsset;
  /** Called with the route the user picked — usually a list page passing
   *  the React Router navigate function. Lets the menu handle "Open" and
   *  "Show usages" without each consumer wiring its own navigate. */
  navigate: (to: string) => void;
}

export function makeShaderContextMenuHandler(
  opts: ShaderMenuOptions,
): (e: React.MouseEvent) => void {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = buildShaderMenuItems(opts);
    if (items.length === 0) return;
    showContextMenu({ x: e.clientX, y: e.clientY, items });
  };
}

export function buildShaderMenuItems(opts: ShaderMenuOptions): ContextMenuItem[] {
  const { asset, navigate } = opts;
  const editUrl = buildShaderEditUrl(asset.path);
  return [
    {
      label: "Open",
      onClick: () => navigate(editUrl),
    },
    {
      label: "Duplicate…",
      onClick: () => duplicateShader(asset, navigate),
    },
    {
      label: "Delete…",
      danger: true,
      onClick: () => deleteShader(asset),
    },
  ];
}

async function duplicateShader(
  asset: ShaderAsset,
  navigate: (to: string) => void,
): Promise<void> {
  const stem = asset.basename.replace(/\.gdshader$/, "");
  const proposed = `${stem}-copy`;
  const newName = await showPrompt({
    title: "Duplicate shader",
    message:
      "Save a copy in the same folder. The .gdshader extension is appended if you leave it off.",
    placeholder: proposed,
    defaultValue: proposed,
    confirmLabel: "Duplicate",
    validate: (v) => {
      const t = v.trim();
      if (!t) return "Name is required";
      if (t.includes("/") || t.includes("\\")) return "No slashes";
      if (t.startsWith(".")) return "No leading dots";
      return null;
    },
  });
  if (!newName) return;
  try {
    // Fetch the source first so the duplicate carries the same content,
    // not the empty template. Two round-trips, but duplicate is rare
    // enough that the extra ms is invisible.
    const file = await shadersApi.getFile(asset.path);
    const created = await shadersApi.create({
      targetDir: asset.parentDir,
      filename: newName,
      shaderType: asset.shaderType ?? "canvas_item",
    });
    await shadersApi.save(created.path, file.source);
    pushToast({
      id: `shader-duplicated:${created.path}`,
      variant: "success",
      title: "Shader duplicated",
      body: created.asset?.basename ?? newName,
    });
    navigate(buildShaderEditUrl(created.path));
  } catch (e) {
    pushToast({
      id: `shader-duplicate-error:${asset.path}`,
      variant: "error",
      title: "Duplicate failed",
      body: String(e),
    });
  }
}

async function deleteShader(asset: ShaderAsset): Promise<void> {
  // Check usages first so the confirm dialog can warn about dangling
  // .tres / .tscn refs. Cheap — usage scan is on the order of tens of ms.
  let usageCount = 0;
  try {
    const r = await shadersApi.usages(asset.path);
    usageCount = r.usages.length;
  } catch {
    // Fall through with usageCount=0; better a generic confirm than no confirm.
  }
  const message =
    usageCount > 0
      ? `${asset.basename} is referenced by ${usageCount} ${usageCount === 1 ? "place" : "places"} in the project. Delete anyway? Those references will dangle until you point them somewhere else.`
      : `Delete ${asset.basename}? This removes the file and its .gdshader.uid sidecar from the Godot project.`;
  const ok = await showConfirm({
    title: "Delete shader",
    message,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await shadersApi.deleteFile(asset.path);
    pushToast({
      id: `shader-deleted:${asset.path}`,
      variant: "info",
      title: "Shader deleted",
      body: `Removed ${res.removed.length} files.`,
    });
  } catch (e) {
    pushToast({
      id: `shader-delete-error:${asset.path}`,
      variant: "error",
      title: "Delete failed",
      body: String(e),
    });
  }
}
