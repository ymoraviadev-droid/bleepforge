import { useEffect, useRef } from "react";

import type { ShaderEvent } from "./stream";

// Listens for `Bleepforge:shader` events on `window` and calls `onChange`
// when one fires. Mirrors useAssetRefresh — the shader gallery + edit
// page use this to react to watcher-detected disk changes (whether from
// another Bleepforge save in a different window, or from a Godot-side
// edit, or from a file manager rename outside of either app).

export function useShaderRefresh(onChange: (event: ShaderEvent) => void): void {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    const listener = (e: WindowEventMap["Bleepforge:shader"]) => {
      handlerRef.current(e.detail);
    };
    window.addEventListener("Bleepforge:shader", listener);
    return () => window.removeEventListener("Bleepforge:shader", listener);
  }, []);
}
