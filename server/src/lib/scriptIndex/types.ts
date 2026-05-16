// scriptIndex types — see ./index.ts for the singleton, ./build.ts for
// the walker.

export interface IndexedScript {
  /** Class name as it appears in C# source (`KarmaDelta`, `LootEntry`).
   *  Derived from the source file's basename. */
  className: string;
  /** Absolute filesystem path to the .cs file. */
  absPath: string;
  /** Godot res:// path. Always forward-slashed, regardless of host OS. */
  resPath: string;
  /** UID read from the .cs.uid sidecar. Null when the sidecar is
   *  missing (older Godot project, or .cs added since last Godot
   *  editor open — the sidecar is editor-generated). */
  uid: string | null;
}
