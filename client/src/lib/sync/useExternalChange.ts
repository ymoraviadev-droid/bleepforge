import { useCallback, useState } from "react";

import type { ExternalChangeKind } from "../../components/ExternalChangeBanner";
import { useSyncRefresh } from "./useSyncRefresh";
// Domain accepts any string — SyncDomain literals plus manifest-
// discovered domain names. Phase 4+.

// Dirty-aware bridge over `useSyncRefresh`. Watches a single entity for
// external changes and:
//
//   - silent refetch when the file changes on disk AND local form is clean
//   - banner shown when the file changes AND local form is DIRTY
//   - banner shown when the file is deleted on disk (regardless of dirty)
//
// Returns the banner-controlling state + a `markChange` helper so callers
// can plug their own custom event paths in if needed.
//
// `baseline` is the entity as last loaded / last saved — the snapshot
// dirtiness is computed against. `current` is the in-progress form state.
// We deep-compare via JSON.stringify (small objects, fine).
//
// Pass `key: undefined` for the "new entity" form — the hook short-
// circuits when `baseline` is null since there's nothing to conflict
// against.

interface Options<T> {
  /** Which sync domain to watch. Any string — SyncDomain literals
   *  (FoB) or manifest-discovered domain names. */
  domain: string;
  /** The specific entity key — `<folder>/<id>` for dialog+balloon, the
   *  primary key otherwise. Pass undefined for new-entity forms. */
  key?: string;
  /** Last-loaded / last-saved snapshot. Null for new entities. */
  baseline: T | null;
  /** Current form state. */
  current: T;
  /** Called when the user picks "Reload from disk" — should fetch the
   *  file again and update both baseline and current. */
  onReload: () => void;
}

interface Result {
  /** True when current diverges from baseline. */
  dirty: boolean;
  /** Banner state — null = no banner. */
  externalChange: { kind: ExternalChangeKind } | null;
  /** Wire onto the banner's Reload button. */
  handleReload: () => void;
  /** Wire onto the banner's Dismiss / Keep editing button. */
  handleDismiss: () => void;
}

export function useExternalChange<T>({
  domain,
  key,
  baseline,
  current,
  onReload,
}: Options<T>): Result {
  const dirty =
    baseline !== null && JSON.stringify(current) !== JSON.stringify(baseline);

  const [externalChange, setExternalChange] = useState<
    { kind: ExternalChangeKind } | null
  >(null);

  useSyncRefresh({
    domain,
    key,
    onChange: (event) => {
      // No baseline → new-entity form. Nothing to conflict against; the
      // event is informational only.
      if (baseline === null) return;
      if (event.action === "deleted") {
        setExternalChange({ kind: "removed" });
        return;
      }
      if (dirty) {
        setExternalChange({ kind: "changed" });
        return;
      }
      // Clean local copy + external update → silent refetch. The caller's
      // refetch updates both baseline and current to the new on-disk value.
      onReload();
    },
  });

  const handleReload = useCallback(() => {
    onReload();
    setExternalChange(null);
  }, [onReload]);

  const handleDismiss = useCallback(() => {
    setExternalChange(null);
  }, []);

  return { dirty, externalChange, handleReload, handleDismiss };
}
