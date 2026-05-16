// Landing page for /manifest — lists every manifest-declared domain.
// Hidden when the manifest has no domains (sidebar doesn't link here
// in that case anyway). Each row is a clickable Link to the domain's
// list page.

import { Link } from "react-router";
import { PixelSkeleton } from "../../components/PixelSkeleton";
import { useManifestDomains } from "./useManifestDomains";

export function ManifestIndex() {
  const { data, error } = useManifestDomains();

  if (error) {
    return (
      <div className="p-6">
        <div className="border-l-4 border-red-600 bg-red-950/40 px-4 py-3 text-red-200">
          Failed to load manifest domains: {error}
        </div>
      </div>
    );
  }
  if (!data) return <PixelSkeleton />;

  return (
    <div className="p-6">
      <header className="mb-4 border-b-2 border-neutral-800 pb-3">
        <h1 className="font-display text-lg tracking-wider text-emerald-300">
          MANIFEST DOMAINS
        </h1>
        <div className="mt-1 text-xs text-neutral-400">
          {data.length === 0
            ? "No manifest-declared domains."
            : `${data.length} domain${data.length === 1 ? "" : "s"} declared in the active project's bleepforge_manifest.json`}
        </div>
      </header>

      {data.length === 0 ? (
        <div className="border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
          <div>This project's manifest has no domains declared.</div>
          <div className="mt-2 text-xs text-neutral-600">
            Install godot-lib in your Godot project, make your resource
            classes inherit BleepforgeResource, then re-export via
            Tools → Re-export Bleepforge manifest.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <Link
              key={d.domain}
              to={`/manifest/${encodeURIComponent(d.domain)}`}
              className="block border-2 border-neutral-800 bg-neutral-950 px-4 py-3 transition-colors hover:border-emerald-700 hover:bg-emerald-950/20"
            >
              <div className="font-display text-sm tracking-wider text-emerald-300">
                {d.domain.toUpperCase()}
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {d.kind}
                {d.class && (
                  <>
                    {" · "}
                    <span className="text-neutral-300">{d.class}</span>
                  </>
                )}
              </div>
              <div className="mt-2 text-[10px] text-neutral-500">
                {d.entityCount}{" "}
                {d.entityCount === 1 ? "entity" : "entities"} discovered
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
