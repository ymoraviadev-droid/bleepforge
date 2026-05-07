import { Router } from "express";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import {
  parseTres,
  valueAsExtRef,
  valueAsString,
  valueAsSubRef,
} from "../import/tresParser.js";

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

itemIconRouter.get("/:slug", async (req, res) => {
  if (!config.godotProjectRoot) {
    res.status(503).json({ error: "GODOT_PROJECT_ROOT not configured" });
    return;
  }
  const slug = String(req.params.slug);
  const itemsDir = path.join(config.godotProjectRoot, "shared", "items", "data");

  let entries;
  try {
    entries = await readdir(itemsDir, { withFileTypes: true });
  } catch (err) {
    res.status(404).json({ error: `items directory not found: ${itemsDir}` });
    return;
  }

  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".tres")) continue;
    const abs = path.join(itemsDir, e.name);
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    const parsed = parseTres(text);
    if (valueAsString(parsed.resourceProps.Slug) !== slug) continue;

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
    return;
  }

  res.status(404).json({ error: `item slug not found in .tres files: ${slug}` });
});

function resPathToAbs(resPath: string, root: string): string {
  if (!resPath.startsWith("res://")) return resPath;
  return path.join(root, resPath.substring("res://".length));
}
