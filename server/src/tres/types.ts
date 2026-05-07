// Round-trip-faithful AST for Godot 4 .tres files.
//
// Every byte of the original text is captured in `preamble`, each section's
// `rawHeaderLine`, the body entries' `rawLine`, and `postamble`. Concatenating
// those strings reproduces the input exactly. Mutation APIs (later) swap a
// body entry's rawLine for a freshly-emitted one — unchanged entries still
// round-trip byte-for-byte.

export type SectionKind = "gd_resource" | "ext_resource" | "sub_resource" | "resource";

export interface ParsedAttr {
  key: string;
  // The raw text of the value as it appears in the header, including quotes
  // when quoted. e.g. `"Resource"`, `3`, `"uid://abc"`.
  rawValue: string;
}

export type BodyEntry =
  | {
      kind: "property";
      key: string;
      // Everything after `=` on this property's line(s), including leading
      // whitespace and the trailing newline. Continuation lines (when value
      // brackets/quotes span multiple lines) are concatenated in.
      rawAfterEquals: string;
      // The complete raw text of this property (key, =, value, newline(s)).
      rawLine: string;
    }
  | {
      kind: "blank";
      // Blank-line text including its line ending.
      raw: string;
    }
  | {
      kind: "opaque";
      // Anything we don't recognize (comments, malformed lines). Preserved verbatim.
      raw: string;
    };

export interface Section {
  kind: SectionKind;
  // The full `[...]` line including its trailing newline.
  rawHeaderLine: string;
  // Parsed attributes from the header bracket. For `[resource]` this is empty.
  attrs: ParsedAttr[];
  // Body lines for sections that take properties (sub_resource, resource).
  // For gd_resource / ext_resource this is typically empty (the blank line
  // after the header is part of the next section's preamble or is captured
  // as a blank-entry here — see parser).
  body: BodyEntry[];
}

export interface Doc {
  // Any text before the first `[` line. Usually empty.
  preamble: string;
  sections: Section[];
  // Any text after the last section's last body entry. Usually empty since
  // body entries already absorb trailing blank lines.
  postamble: string;
}
