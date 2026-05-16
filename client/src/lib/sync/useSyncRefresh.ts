import { useEffect, useRef } from "react";
import type { SyncEvent } from "./stream";

// Listens for `Bleepforge:sync` events on `window` and calls `onChange`
// when one matches the given domain (and key, if provided).
//
//   useSyncRefresh({ domain: "item", onChange: refetchList });   // any item
//   useSyncRefresh({ domain: "item", key: slug, onChange: ... }); // one item
//   useSyncRefresh({ domain: "dialog", key: `${folder}/${id}`, onChange: ... });
//   useSyncRefresh({ domain: "note", onChange: refetchManifestDomain });
//
// `domain` accepts any string — SyncDomain literals (FoB hardcoded) AND
// manifest-discovered domain names (v0.2.8 Phase 4+).

export function useSyncRefresh(opts: {
  domain: string;
  key?: string;
  onChange: (event: SyncEvent) => void;
}): void {
  // Keep onChange in a ref so we don't re-bind the window listener on every
  // render of the consuming component.
  const handlerRef = useRef(opts.onChange);
  handlerRef.current = opts.onChange;

  useEffect(() => {
    const listener = (e: WindowEventMap["Bleepforge:sync"]) => {
      const ev = e.detail;
      if (ev.domain !== opts.domain) return;
      if (opts.key !== undefined && ev.key !== opts.key) return;
      handlerRef.current(ev);
    };
    window.addEventListener("Bleepforge:sync", listener);
    return () => window.removeEventListener("Bleepforge:sync", listener);
  }, [opts.domain, opts.key]);
}
