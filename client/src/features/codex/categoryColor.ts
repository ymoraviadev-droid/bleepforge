import type { CodexColor } from "@bleepforge/shared";
import { paletteColorClasses } from "../../lib/paletteColor";

// Per-category color → Tailwind class strings. Both Codex and Help draw
// from the same eight-color palette, so the actual class table lives in
// the shared paletteColorClasses helper. This module exists as a
// type-narrowing entry point: CodexColor is a re-export of the eight
// allowed names, so callers in this feature always pass a valid color.

export function categoryColorClasses(color: CodexColor) {
  return paletteColorClasses(color);
}
