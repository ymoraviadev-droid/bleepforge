import { useEffect } from "react";
import { pushToast } from "../../components/Toast";
import { DOMAIN_LABELS, toToastBody } from "../saves/domainLabels";
import type { SyncEvent } from "./stream";

// Maps every INCOMING sync event coming off the SSE stream into a
// toast. Mounted once at App root via useSyncToasts(). "Incoming" =
// the watcher detected an external change to the .tres (typically a
// Godot-side save). Bleepforge's own saves don't fire sync events —
// the watcher has self-write suppression — so this hook stays
// directionally clean.
//
// Pairs with useOutgoingSaveToasts (lib/saves/outgoingSaveToasts.ts)
// which handles the other direction (Bleepforge → disk) with a
// visually-distinct "saved" variant (cyan vs emerald) and a clear
// title prefix ("Saved X") so the user can tell at a glance which
// direction a save came from.
//
// Domain → label + route lives in lib/saves/domainLabels.ts so both
// hooks share the same metadata.

export function useSyncToasts(): void {
  useEffect(() => {
    const onSync = (e: CustomEvent<SyncEvent>) => {
      const { domain, key, action } = e.detail;
      const info = DOMAIN_LABELS[domain];
      if (!info) return;
      const updated = action === "updated";
      pushToast({
        // Dedupe by domain+key so rapid re-saves of the same entity
        // replace the existing toast instead of stacking. Action is
        // part of the id so a delete-then-recreate sequence doesn't
        // visually conflate them.
        id: `sync:${domain}:${key}:${action}`,
        // "externally" makes the directionality unambiguous next to a
        // Bleepforge-side "Saved X" toast — without the suffix both
        // would just read "X saved" and be visually distinguishable
        // only by color, which fails accessibility for color-blind
        // users.
        title: `${info.label} ${updated ? "updated externally" : "deleted externally"}`,
        body: toToastBody(domain, key),
        to: updated ? info.updatedRoute(key) : info.deletedRoute(key),
        variant: updated ? "success" : "warn",
      });
    };
    window.addEventListener("Bleepforge:sync", onSync);
    return () => window.removeEventListener("Bleepforge:sync", onSync);
  }, []);
}
