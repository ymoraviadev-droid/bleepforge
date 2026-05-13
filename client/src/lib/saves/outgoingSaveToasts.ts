import { useEffect } from "react";
import { pushToast } from "../../components/Toast";
import type { SaveEntry } from "../api";
import { DOMAIN_LABELS, toToastBody } from "./domainLabels";

// Maps every OUTGOING save event (Bleepforge → disk) into a toast.
// Mounted once at App root via useOutgoingSaveToasts(). Pairs with
// useSyncToasts (which handles incoming, Godot-side saves) — together
// they give the user toast-level feedback for every save direction.
//
// The toasts use the "saved" Toast variant — cyan border + bar +
// icon — so they're at-a-glance distinct from the emerald "incoming"
// success toasts. Title is "Saved X" (terse, declarative) vs the
// incoming toast's "X updated externally" (explicit direction
// marker). Color + title together so the distinction works for both
// color-blind users (title carries it) and quick-glance users
// (color carries it).
//
// All windows hear the saves SSE stream. That means in a multi-window
// setup, Window B sees Window A's outgoing save toast too. Acceptable:
// the semantic "Bleepforge saved this" stays correct regardless of
// which window did it. The user's in-page "Saved ✓" pill on the
// originating window already provides per-window confirmation; the
// toast is the cross-cutting status surface.
//
// Failed saves (outcome === "error") get the standard error variant +
// the server's message as the body so the user sees the failure
// instead of a misleading green "saved" toast. Warning outcomes (the
// save landed but the writer flagged something — e.g. orphan
// ext_resources cleaned up) toast with the warn variant.

export function useOutgoingSaveToasts(): void {
  useEffect(() => {
    const onSave = (e: CustomEvent<SaveEntry>) => {
      const entry = e.detail;
      if (entry.direction !== "outgoing") return;
      const info = DOMAIN_LABELS[entry.domain];
      if (!info) return;

      const updated = entry.action === "updated";

      // Error: red, server's message, no link (the file's state is
      // ambiguous after a failed save). Warn: amber, link goes to the
      // edit page so the user can address whatever the writer flagged.
      // Ok: cyan "saved" variant, link to the updated entity / its
      // list page if deleted.
      if (entry.outcome === "error") {
        pushToast({
          id: `save:${entry.domain}:${entry.key}:${entry.action}`,
          title: `${info.label} save failed`,
          body: entry.error ?? toToastBody(entry.domain, entry.key),
          variant: "error",
        });
        return;
      }

      const route = updated
        ? info.updatedRoute(entry.key)
        : info.deletedRoute(entry.key);

      pushToast({
        // Dedupe by domain+key+action; same shape as useSyncToasts so
        // rapid re-saves of the same entity collapse to a single toast
        // that resets its timer.
        id: `save:${entry.domain}:${entry.key}:${entry.action}`,
        title: updated
          ? `Saved ${info.label.toLowerCase()}`
          : `Deleted ${info.label.toLowerCase()}`,
        body: toToastBody(entry.domain, entry.key),
        to: route,
        // Warnings (e.g. orphan ext_resource cleanup) downgrade the
        // toast to amber so the user notices something to address —
        // still a successful save, just not a quiet one.
        variant:
          entry.outcome === "warning"
            ? "warn"
            : updated
              ? "saved"
              : "warn",
      });
    };
    window.addEventListener("Bleepforge:save", onSave);
    return () => window.removeEventListener("Bleepforge:save", onSave);
  }, []);
}
