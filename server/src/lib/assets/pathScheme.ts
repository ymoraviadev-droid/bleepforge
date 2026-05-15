// Project-relative URL scheme for asset references (v0.2.6 phase 5).
//
// Notebook-mode projects own their asset + shader files under
// `<bleepforgeRoot>/projects/<slug>/content/`. Storing absolute
// filesystem paths in JSON ties the project to the machine that
// authored it; moving the Bleepforge install (or syncing across
// machines) would break every reference.
//
// The `content://` scheme is project-relative: `content://images/foo.png`
// resolves to `<contentRoot>/images/foo.png` at request time. Server's
// asset router decodes it; clients persist the scheme verbatim. Works
// across machine moves as long as contentRoot is correctly resolved
// per-machine (which the registry + active-project pointer handle).
//
// Sync mode keeps storing absolute paths for now — converting the
// existing Flock-of-Bleeps corpus to content:// would be a wider
// migration that doesn't fit phase 5. New notebook projects start
// portable from day one.

import path from "node:path";
import { config, isSyncMode } from "../../config.js";

export const CONTENT_SCHEME = "content://";

/** Convert an absolute filesystem path into a `content://` URL when:
 *  - the path sits under contentRoot, AND
 *  - the active project is in notebook mode.
 *
 *  Returns the absolute path unchanged for sync-mode projects (keeps
 *  existing data on absolute paths) or for paths outside contentRoot
 *  (e.g. assets the user references from $HOME or another tree). */
export function toPortablePath(absPath: string): string {
  if (isSyncMode()) return absPath;
  if (!config.contentRoot) return absPath;
  const rel = path.relative(config.contentRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return absPath;
  // Normalize separators to forward slashes so the same scheme string
  // works on Windows + Linux/macOS.
  const normalized = rel.split(path.sep).join("/");
  return `${CONTENT_SCHEME}${normalized}`;
}

/** Resolve a `content://` URL OR a plain absolute path back to an
 *  absolute filesystem path. Returns null when a content:// path is
 *  passed but no contentRoot is configured. */
export function resolveContentPath(input: string): string | null {
  if (input.startsWith(CONTENT_SCHEME)) {
    if (!config.contentRoot) return null;
    const rel = input.slice(CONTENT_SCHEME.length);
    return path.join(config.contentRoot, rel);
  }
  return path.resolve(input);
}
