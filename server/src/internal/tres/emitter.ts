import type { Doc } from "./types.js";

// Re-emits a Doc back to text. Because the parser captured every byte in
// `preamble`, `rawHeaderLine`, body entries' raw fields, and `postamble`,
// concatenating them in order reproduces the input verbatim — provided no
// mutation has happened. Mutation APIs (later) will update the relevant
// raw fields; everything else still round-trips.

export function emitTres(doc: Doc): string {
  let out = doc.preamble;
  for (const section of doc.sections) {
    out += section.rawHeaderLine;
    for (const entry of section.body) {
      if (entry.kind === "property") out += entry.rawLine;
      else out += entry.raw;
    }
  }
  out += doc.postamble;
  return out;
}
