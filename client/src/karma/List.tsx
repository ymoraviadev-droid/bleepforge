import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ButtonLink } from "../Button";
import type { KarmaImpact } from "@bleepforge/shared";
import { karmaApi } from "../api";
import { useSyncRefresh } from "../sync/useSyncRefresh";

export function KarmaList() {
  const [impacts, setImpacts] = useState<KarmaImpact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    karmaApi.list().then(setImpacts).catch((e) => setError(String(e)));
  }, []);

  useSyncRefresh({
    domain: "karma",
    onChange: () => karmaApi.list().then(setImpacts).catch(() => {}),
  });

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (impacts === null) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Karma impacts</h1>
        <ButtonLink to="/karma/new">New</ButtonLink>
      </div>
      {impacts.length === 0 ? (
        <p className="text-neutral-500">No impacts yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {impacts.map((k) => (
            <li key={k.Id} className="hover:bg-neutral-900">
              <Link
                to={`/karma/${encodeURIComponent(k.Id)}`}
                className="block px-4 py-3"
              >
                <div className="font-mono text-sm text-neutral-100">{k.Id}</div>
                <div className="text-xs text-neutral-500">
                  {k.Deltas.length} {k.Deltas.length === 1 ? "delta" : "deltas"}
                  {k.Description ? ` · ${k.Description.slice(0, 60)}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
