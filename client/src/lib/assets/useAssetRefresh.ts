import { useEffect, useRef } from "react";

import type { AssetEvent } from "./stream";

// Listens for `Bleepforge:asset` events on `window` and calls `onChange`
// when one fires. Mirrors useSyncRefresh — the gallery uses this to keep
// itself live as Yonatan saves images in Aseprite/Krita/etc.

export function useAssetRefresh(onChange: (event: AssetEvent) => void): void {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    const listener = (e: WindowEventMap["Bleepforge:asset"]) => {
      handlerRef.current(e.detail);
    };
    window.addEventListener("Bleepforge:asset", listener);
    return () => window.removeEventListener("Bleepforge:asset", listener);
  }, []);
}
