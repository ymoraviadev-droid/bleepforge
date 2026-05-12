import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../../config.js";
import {
  parseTres,
  valueAsExtRef,
  valueAsString,
  valueAsSubRef,
} from "../../internal/import/tresParser.js";
import { projectIndex } from "../../lib/projectIndex/index.js";

export const itemIconRouter: Router = Router();

interface AtlasIconResponse {
  kind: "atlas";
  atlasPath: string; // absolute fs path
  region: { x: number; y: number; w: number; h: number };
}
interface ImageIconResponse {
  kind: "image";
  imagePath: string; // absolute fs path
}
type IconResponse = AtlasIconResponse | ImageIconResponse;

// Resolves the Icon for an item by reading its `.tres` directly. Bleepforge's
// JSON-side Icon field has historically been empty for atlas-textured items
// because the importer skipped them; this endpoint sidesteps that and reads
// the source of truth on demand. Bleepforge's JSON is unaffected.
//
// The .tres file is found via ProjectIndex (content-driven, anywhere in
// the Godot project). Once we have the file, the Icon ext_resource path
// resolves through the file's own [ext_resource] table — so the actual
// PNG can live anywhere too. No hardcoded path assumptions.

itemIconRouter.get("/:slug", async (req, res) => {
  if (!config.godotProjectRoot) {
    res.status(503).json({ error: "GODOT_PROJECT_ROOT not configured" });
    return;
  }
  const slug = String(req.params.slug);

  const entry = projectIndex.get("item", slug);
  if (!entry) {
    res.status(404).json({ error: `item slug not in project index: ${slug}` });
    return;
  }

  let text: string;
  try {
    text = await readFile(entry.absPath, "utf8");
  } catch (err) {
    res.status(500).json({
      error: `failed to read indexed .tres for ${slug}: ${(err as Error).message}`,
    });
    return;
  }

  const parsed = parseTres(text);
  if (valueAsString(parsed.resourceProps.Slug) !== slug) {
    // Sanity check — index pointed us at a file whose Slug doesn't match.
    // This shouldn't happen if the watcher is keeping the index live, but
    // log it so we notice drift instead of silently returning a wrong icon.
    console.warn(
      `[item-icon] index pointed to ${entry.absPath} for slug=${slug} but file's Slug is ${valueAsString(parsed.resourceProps.Slug)}`,
    );
    res.json(null);
    return;
  }

  const iconVal = parsed.resourceProps.Icon;
  if (!iconVal) {
    res.json(null);
    return;
  }

  // Atlas case: Icon = SubResource("AtlasTexture_xxx")
  const subId = valueAsSubRef(iconVal);
  if (subId) {
    const sub = parsed.subResources.get(subId);
    if (sub && sub.type === "AtlasTexture") {
      const atlasRef = valueAsExtRef(sub.props.atlas);
      const region = sub.props.region;
      if (atlasRef && region?.kind === "rect2") {
        const ext = parsed.extResources.get(atlasRef);
        if (ext?.path) {
          const response: AtlasIconResponse = {
            kind: "atlas",
            atlasPath: resPathToAbs(ext.path, config.godotProjectRoot),
            region: { x: region.x, y: region.y, w: region.w, h: region.h },
          };
          res.json(response);
          return;
        }
      }
    }
  }

  // Direct image case: Icon = ExtResource("...")
  const extId = valueAsExtRef(iconVal);
  if (extId) {
    const ext = parsed.extResources.get(extId);
    if (ext?.path) {
      const response: ImageIconResponse = {
        kind: "image",
        imagePath: resPathToAbs(ext.path, config.godotProjectRoot),
      };
      res.json(response);
      return;
    }
  }

  res.json(null);
});

function resPathToAbs(resPath: string, root: string): string {
  if (!resPath.startsWith("res://")) return resPath;
  return path.join(root, resPath.substring("res://".length));
}
