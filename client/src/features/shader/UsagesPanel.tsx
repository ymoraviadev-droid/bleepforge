import { Link } from "react-router";

import type { ShaderUsage, ShaderUsageDomain } from "../../lib/api";

// Inline usages list — rendered next to the source on the shader edit
// page. Same row shape as the asset UsagesDrawer (route-clickable .tres
// rows, non-clickable .tscn rows), but as a panel rather than a slide-in
// drawer. The edit page is the destination for "I want to look at one
// shader," and inline usages are the answer to "where else does this
// shader live" — no reason to make the user open another surface to get
// there.

interface Props {
  usages: ShaderUsage[] | null;
  error: string | null;
}

export function ShaderUsagesPanel({ usages, error }: Props) {
  return (
    <section className="border-2 border-neutral-800 bg-neutral-950">
      <header className="border-b-2 border-neutral-800 px-3 py-2">
        <h2 className="font-display text-xs uppercase tracking-wider text-neutral-300">
          Usages
          {usages && (
            <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-neutral-500">
              ({usages.length})
            </span>
          )}
        </h2>
      </header>
      <div className="p-3">
        {error && (
          <p className="font-mono text-xs text-red-400">Error: {error}</p>
        )}
        {!error && usages === null && (
          <p className="font-mono text-xs text-neutral-500">Searching…</p>
        )}
        {!error && usages && usages.length === 0 && (
          <p className="font-mono text-xs text-neutral-500">
            Not referenced by any .tres or .tscn. Safe to delete from
            Godot's FileSystem dock if you don't need it.
          </p>
        )}
        {!error && usages && usages.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {usages.map((u, i) => (
              <UsageItem key={`${u.kind}:${u.file}:${i}`} usage={u} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function UsageItem({ usage }: { usage: ShaderUsage }) {
  const target = routeFor(usage.domain, usage.key);
  const { label: kindLabel, class: kindClass } = badgeForKind(usage.kind);
  const inner = (
    <div className="flex flex-col gap-0.5 border-2 border-neutral-800 bg-neutral-900 p-2 transition-colors group-hover:border-emerald-700">
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 border px-1 font-mono text-[9px] uppercase tracking-wider ${kindClass}`}
        >
          {kindLabel}
        </span>
        {usage.domain && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
            {usage.domain}
          </span>
        )}
        {usage.key && (
          <span
            className="truncate font-mono text-xs text-neutral-100"
            title={usage.key}
          >
            {usage.key}
          </span>
        )}
      </div>
      <div
        className="truncate font-mono text-[10px] text-neutral-500"
        title={usage.snippet}
      >
        {usage.snippet}
      </div>
      <div
        className="truncate font-mono text-[9px] text-neutral-700"
        title={usage.file}
      >
        {usage.file}
      </div>
    </div>
  );
  if (!target) return <li>{inner}</li>;
  return (
    <li>
      <Link to={target} className="group block">
        {inner}
      </Link>
    </li>
  );
}

// Same kind → color mapping the asset usages drawer uses, so .tres and
// .tscn are visually consistent across both surfaces. Shader usages never
// see "json" today (no Bleepforge JSON references shaders), but we keep
// the branch for parity with the asset surface and future-proofing.
function badgeForKind(kind: ShaderUsage["kind"]): { label: string; class: string } {
  switch (kind) {
    case "tres":
      return { label: ".tres", class: "border-amber-800 text-amber-400" };
    case "tscn":
      return { label: ".tscn", class: "border-cyan-800 text-cyan-400" };
    case "json":
      return { label: "json", class: "border-emerald-800 text-emerald-400" };
  }
}

function routeFor(
  domain: ShaderUsageDomain | null,
  key: string | null,
): string | null {
  if (!domain) return null;
  if (domain === "concept") return "/concept/edit";
  if (!key) return null;
  switch (domain) {
    case "item":
      return `/items/${encodeURIComponent(key)}`;
    case "quest":
      return `/quests/${encodeURIComponent(key)}`;
    case "karma":
      return `/karma/${encodeURIComponent(key)}`;
    case "npc":
      return `/npcs/${encodeURIComponent(key)}`;
    case "faction":
      return `/factions/${encodeURIComponent(key)}`;
    case "dialog": {
      const [folder, id] = splitFolderKey(key);
      if (!folder || !id) return null;
      return `/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
    }
    case "balloon": {
      const [folder, basename] = splitFolderKey(key);
      if (!folder || !basename) return null;
      return `/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(basename)}`;
    }
  }
}

function splitFolderKey(key: string): [string | null, string | null] {
  const idx = key.indexOf("/");
  if (idx <= 0) return [null, null];
  return [key.slice(0, idx), key.slice(idx + 1)];
}
