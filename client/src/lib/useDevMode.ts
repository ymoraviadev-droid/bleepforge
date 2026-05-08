import { useEffect, useState } from "react";
import { healthApi } from "./api";

// Module-scoped cache so the dev-mode flag is fetched at most once per
// session. The flag comes from BLEEPFORGE_DEV_MODE on the server and is
// captured at boot, so it can't change while the app is running anyway.
//
// Default is `false`: if the fetch fails for any reason (server down,
// network blip), we treat the flag as off and hide authoring UI rather
// than render edit buttons that would 403 on click.
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

function loadDevMode(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = healthApi
    .get()
    .then((h) => {
      cached = !!h.devMode;
      return cached;
    })
    .catch(() => {
      cached = false;
      return false;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useDevMode(): boolean {
  const [value, setValue] = useState<boolean>(cached ?? false);
  useEffect(() => {
    let cancelled = false;
    loadDevMode().then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return value;
}
