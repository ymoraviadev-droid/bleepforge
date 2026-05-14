// Cross-platform basename + dirname helpers for client code that handles
// filesystem paths coming from the server. The server uses Node's `path`
// module, which produces backslashes on Windows and forward slashes on
// Linux/macOS. The browser has no built-in path module, so we hand-roll
// these to split on either separator.
//
// Use these any time the input path was produced by the server's filesystem
// (e.g. AssetThumb basename, ImageEditor filename derivation, watcher feed
// path shortening). For Bleepforge-internal id strings like
// "<folder>/<basename>" — which are always forward-slashed by convention —
// plain .split("/") is still correct.

const SEP_REGEX = /[/\\]/;

/** Last path segment ("foo/bar/baz" → "baz", "C:\\foo\\bar" → "bar"). */
export function lastPathSegment(p: string): string {
  const parts = p.split(SEP_REGEX).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** Everything before the last separator ("C:\\foo\\bar.png" → "C:\\foo"). */
export function dirOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx === -1 ? "" : p.slice(0, idx);
}
