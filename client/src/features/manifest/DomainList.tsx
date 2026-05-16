// Generic list page for a manifest-declared domain.
//
// Read-only MVP shape: header (domain name + manifest metadata) +
// table of discovered entities. Each row shows identity-only fields
// (id, scriptClass for discriminatedFamily variants, folder for
// foldered domains, abs path). No edit affordances — that's v0.2.9.
//
// Routed at /manifest/:domain. Falls back to NotFoundPage when the
// domain isn't in the manifest.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { manifestDomainsApi, type ManifestDomainDetail } from "../../lib/api";
import { PixelSkeleton } from "../../components/PixelSkeleton";
import { NotFoundPage } from "../../components/NotFoundPage";

export function DomainList() {
  const { domain = "" } = useParams<{ domain: string }>();
  const [data, setData] = useState<ManifestDomainDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    setNotFound(false);
    let alive = true;
    (async () => {
      try {
        const result = await manifestDomainsApi.get(domain);
        if (alive) setData(result);
      } catch (err) {
        if (!alive) return;
        const msg = (err as Error).message;
        if (msg.includes("404")) setNotFound(true);
        else setError(msg);
      }
    })();
    return () => {
      alive = false;
    };
  }, [domain]);

  if (notFound) return <NotFoundPage />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <PixelSkeleton />;
  return <DomainView detail={data} />;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="border-l-4 border-red-600 bg-red-950/40 px-4 py-3 text-red-200">
        <div className="font-medium">Failed to load domain</div>
        <div className="mt-1 font-mono text-xs">{message}</div>
      </div>
    </div>
  );
}

function DomainView({ detail }: { detail: ManifestDomainDetail }) {
  const { entry, entities } = detail;
  const className =
    entry.kind === "discriminatedFamily" ? entry.base.class : entry.class;

  return (
    <div className="p-6">
      <header className="mb-4 border-b-2 border-neutral-800 pb-3">
        <h1 className="font-display text-lg tracking-wider text-emerald-300">
          {entry.domain.toUpperCase()}
        </h1>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
          <span>
            kind: <span className="text-neutral-200">{entry.kind}</span>
          </span>
          <span>
            class: <span className="text-neutral-200">{className}</span>
          </span>
          <span>
            view: <span className="text-neutral-200">{entry.view}</span>
          </span>
          {entry.overrideUi && (
            <span>
              overrideUi:{" "}
              <span className="text-neutral-200">{entry.overrideUi}</span>
            </span>
          )}
          <span>
            {entities.length}{" "}
            {entities.length === 1 ? "entity" : "entities"} discovered
          </span>
        </div>
        <div className="mt-2 text-[10px] text-neutral-500">
          Manifest-declared domain. Read-only in v0.2.7 — full edit support
          lands when the importer + writer wiring complete in v0.2.9.
        </div>
      </header>

      {entities.length === 0 ? (
        <div className="border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
          No .tres files matched this domain's classification rules. Check
          that your resources inherit BleepforgeResource, your registry is a
          BleepforgeRegistry subclass, and the manifest has been re-exported.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">id</th>
                {entry.kind === "discriminatedFamily" && (
                  <th className="px-2 py-1.5 font-medium">variant</th>
                )}
                {entry.kind === "foldered" && (
                  <th className="px-2 py-1.5 font-medium">folder</th>
                )}
                <th className="px-2 py-1.5 font-medium">path</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr
                  key={e.absPath}
                  className="border-b border-neutral-900 transition-colors hover:bg-neutral-900/50"
                >
                  <td className="px-2 py-1.5 font-mono text-emerald-300">
                    {e.id}
                  </td>
                  {entry.kind === "discriminatedFamily" && (
                    <td className="px-2 py-1.5 text-neutral-300">
                      {e.scriptClass ?? "—"}
                    </td>
                  )}
                  {entry.kind === "foldered" && (
                    <td className="px-2 py-1.5 text-neutral-300">
                      {e.folder ?? "—"}
                    </td>
                  )}
                  <td className="px-2 py-1.5 font-mono text-[11px] text-neutral-500">
                    {e.resPath}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-xs text-neutral-500">
        <Link to="/manifest" className="hover:text-emerald-400">
          ← all manifest domains
        </Link>
      </div>
    </div>
  );
}
