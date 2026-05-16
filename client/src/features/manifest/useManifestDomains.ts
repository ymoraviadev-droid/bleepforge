// Hook: fetch the manifest-declared domains index. Powers the dynamic
// sidebar nav rows + the /manifest landing page. Fetches once on mount
// and on every catalog-refresh signal — the manifest itself changes
// rarely (Tools menu re-export from the user's Godot editor), so we
// don't add a separate SSE channel for it; a catalog refresh covers
// the common case.

import { useEffect, useState } from "react";
import { manifestDomainsApi, type ManifestDomainSummary } from "../../lib/api";
import { subscribeCatalog } from "../../lib/catalog-bus";

export interface UseManifestDomainsResult {
  data: ManifestDomainSummary[] | null;
  error: string | null;
  refresh: () => void;
}

export function useManifestDomains(): UseManifestDomainsResult {
  const [data, setData] = useState<ManifestDomainSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await manifestDomainsApi.list();
        if (alive) setData(result.domains);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  // Manifest changes are infrequent but real: the user re-exports from
  // Godot's Tools menu, or godot-lib's build hook fires on a CI build.
  // The server's chokidar watcher refreshes manifestCache; the client
  // catches up either via this catalog-bus subscription or on next
  // mount, whichever fires first.
  useEffect(() => {
    return subscribeCatalog(() => setTick((t) => t + 1));
  }, []);

  return {
    data,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}
