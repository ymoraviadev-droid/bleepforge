import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Npc } from "@bleepforge/shared";
import { npcsApi } from "../api";
import { AssetThumb } from "../AssetThumb";
import { ButtonLink } from "../Button";

export function NpcList() {
  const [npcs, setNpcs] = useState<Npc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    npcsApi.list().then(setNpcs).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (npcs === null) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">NPCs</h1>
        <ButtonLink to="/npcs/new">New</ButtonLink>
      </div>
      {npcs.length === 0 ? (
        <p className="text-neutral-500">No NPCs documented yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {npcs.map((n) => (
            <li key={n.NpcId} className="hover:bg-neutral-900">
              <Link
                to={`/npcs/${encodeURIComponent(n.NpcId)}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <AssetThumb path={n.Portraits[0] ?? ""} size="md" />
                <div className="min-w-0">
                  <div className="font-mono text-sm text-neutral-100">{n.NpcId}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {n.DisplayName || "(no display name)"}
                    {n.Description ? ` · ${n.Description.slice(0, 80)}` : ""}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
