import {
  validateEntryAgainstMeta,
  validatePropertyValue,
  type CodexCategoryMeta,
  type CodexEntry,
  type CodexPropertyDef,
} from "@bleepforge/shared";
import type { Catalog } from "../../lib/useCatalog";

// Client-side validator that layers FK existence on top of the shared
// type-vs-value check. Used by the entry edit form (inline errors) and
// the integrity tab (cross-domain check).
//
// Why FK existence is client-only: the server doesn't have a unified
// view of all domains at write time (each domain has its own storage
// module), and the Bleepforge integrity story is already a "gather all,
// check, surface" client-side pass via useCatalog → computeIssues.
// Repeating that on the server would be redundant.

export interface CodexValidationError {
  property: string; // CodexPropertyDef.Key
  message: string;
}

function refDomainExists(
  catalog: Catalog,
  def: CodexPropertyDef,
  value: unknown,
): boolean {
  if (typeof value !== "string" || value === "") return true;
  switch (def.RefDomain) {
    case "npc":
      return catalog.npcs.some((n) => n.NpcId === value);
    case "item":
      return catalog.items.some((i) => i.Slug === value);
    case "quest":
      return catalog.quests.some((q) => q.Id === value);
    case "faction":
      return catalog.factions.some((f) => f.Faction === value);
    case "dialog":
      return catalog.sequences.some((s) => s.Id === value);
    case "balloon":
      return catalog.balloonRefs.some((b) => b.id === value);
    default:
      // No RefDomain set on a "ref" property — schema author hasn't
      // finished configuring this property. Don't flag the value;
      // CategoryEdit's own validation will catch the missing RefDomain.
      return true;
  }
}

export function validateCodexEntry(
  meta: CodexCategoryMeta,
  entry: CodexEntry,
  catalog: Catalog | null,
): CodexValidationError[] {
  const errors: CodexValidationError[] = [];

  // Type-vs-value first. Shared validator returns flat strings, so we
  // re-run per-property here to keep the property key alongside the
  // message — better UX in the form (highlight the offending field).
  for (const def of meta.Properties) {
    const err = validatePropertyValue(def, entry.Properties[def.Key]);
    if (err) errors.push({ property: def.Key, message: err });
  }

  // Then FK ref existence — only when the catalog is available (the
  // form may render before catalog has loaded; treat that as "no
  // dangling errors yet" rather than a noisy false positive).
  if (catalog) {
    for (const def of meta.Properties) {
      if (def.Type !== "ref") continue;
      const value = entry.Properties[def.Key];
      if (!refDomainExists(catalog, def, value)) {
        errors.push({
          property: def.Key,
          message: `"${def.Label || def.Key}" → "${String(value)}" not found in ${def.RefDomain}s`,
        });
      }
    }
  }

  return errors;
}

// Convenience for callers that want a flat error list (e.g. the
// integrity tab, where the per-property association doesn't matter).
export function validateCodexEntryFlat(
  meta: CodexCategoryMeta,
  entry: CodexEntry,
  catalog: Catalog | null,
): string[] {
  // Shared's flat function covers structural; we add FK on top.
  const flat = validateEntryAgainstMeta(meta, entry);
  if (catalog) {
    for (const def of meta.Properties) {
      if (def.Type !== "ref") continue;
      const value = entry.Properties[def.Key];
      if (!refDomainExists(catalog, def, value)) {
        flat.push(
          `"${def.Label || def.Key}" → "${String(value)}" not found in ${def.RefDomain}s`,
        );
      }
    }
  }
  return flat;
}
