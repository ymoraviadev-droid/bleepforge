// scriptIndex singleton — built once at boot, queried on every save
// that mints a sub_resource section (the array + subresource handlers
// in the generic mapper).
//
// Holds two indices over the same set of entries:
//   - byClassName: lookup by C# class name (used by the array handler
//                  to find a sub-resource's underlying script).
//   - byResPath:   lookup by res:// path (used when finding an
//                  existing Script ext_resource needs UID confirmation).
//
// Build cost: ~5ms for FoB's ~80 .cs files. Negligible alongside the
// .tres ProjectIndex build that runs in the same boot phase.
//
// No watcher hook in v0.2.7 — script files don't change during a
// normal Bleepforge editing session (the user is editing content, not
// engine code). If that turns out to be a real workflow, add a
// chokidar watcher for `**/*.cs` + `**/*.cs.uid` and call rebuild()
// from its handler.

import { walkScripts } from "./build.js";
import type { IndexedScript } from "./types.js";

class ScriptIndex {
  private byClassName = new Map<string, IndexedScript>();
  private byResPath = new Map<string, IndexedScript>();

  async build(godotRoot: string): Promise<void> {
    this.reset();
    const scripts = await walkScripts(godotRoot);
    for (const s of scripts) {
      this.byClassName.set(s.className, s);
      this.byResPath.set(s.resPath, s);
    }
  }

  /** Clears both indices. Called on project hot-reload (switch active
   *  project) and during boot for notebook / limp mode. */
  reset(): void {
    this.byClassName.clear();
    this.byResPath.clear();
  }

  /** Look up by C# class name. Returns null if no matching .cs file
   *  was found. */
  getByClassName(className: string): IndexedScript | null {
    return this.byClassName.get(className) ?? null;
  }

  /** Look up by res:// path. Returns null if no matching .cs file
   *  was found. */
  getByResPath(resPath: string): IndexedScript | null {
    return this.byResPath.get(resPath) ?? null;
  }

  list(): IndexedScript[] {
    return [...this.byClassName.values()];
  }
}

export const scriptIndex: ScriptIndex = new ScriptIndex();
