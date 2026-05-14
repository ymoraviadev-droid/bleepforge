import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Concept } from "@bleepforge/shared";

import { AssetThumb } from "../../components/AssetThumb";
import {
  BalloonIcon,
  BookIcon,
  BubbleIcon,
  CrateIcon,
  FrameIcon,
  RobotIcon,
  ScaleIcon,
  ScrollIcon,
  ShaderIcon,
  ShieldIcon,
} from "../../components/NavIcons";
import { LogoPlaceholder } from "../../components/PixelPlaceholder";
import { PixelSkeleton } from "../../components/PixelSkeleton";
import { conceptApi, savesApi, type SaveEntry } from "../../lib/api";
import { computeIssues } from "../../lib/integrity/issues";
import { DOMAIN_LABELS } from "../../lib/saves/domainLabels";
import { useCatalog } from "../../lib/useCatalog";

// The Workbench is the app's overview / "where you sit" page. Four
// blocks stacked top-to-bottom:
//
//   1. Concept header strip — splash + title + tagline pulled from
//      data/concept.json. Click anywhere on the strip → /concept.
//      Concept used to be the homepage; demoted to one surface in v0.2.4.
//
//   2. Stats grid — one tile per domain showing the catalog count,
//      each tile a Link to that domain's list page. Reuses the same
//      pixel-art icons the sidebar uses so the visual identity carries.
//
//   3. Recent activity — last 15 entries from the Saves SSE stream,
//      both directions. Mirrors the Diagnostics → Saves tab but compact
//      + always-visible-on-launch instead of behind a tab. Initial
//      snapshot from /api/saves + live appends via the existing
//      `Bleepforge:save` window event.
//
//   4. Integrity strip — one-line summary of computeIssues() with a
//      link to /diagnostics/integrity. Same data the sidebar's
//      diagnostics icon already surfaces, just spelled out.
//
// Generic-for-any-Godot-project safe: nothing on this page hardcodes
// Flock of Bleeps' content. The concept block reads the user's own
// concept.json; everything else is just counts + activity.

const FEED_LIMIT = 15;

export function Workbench() {
  const catalog = useCatalog();
  const [concept, setConcept] = useState<Concept | null>(null);
  const [recentSaves, setRecentSaves] = useState<SaveEntry[]>([]);
  const [assetCount, setAssetCount] = useState<number | null>(null);

  useEffect(() => {
    conceptApi.get().then(setConcept).catch(() => setConcept(null));
    savesApi
      .list()
      .then((entries) => setRecentSaves(entries.slice(0, FEED_LIMIT)))
      .catch(() => setRecentSaves([]));
    // Asset count is the only one not surfaced via useCatalog (assets
    // aren't part of the autocomplete catalog — too large + not
    // referenced by id elsewhere). One-shot fetch is plenty; the
    // count doesn't need to be live.
    fetch("/api/assets/images")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAssetCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setAssetCount(0));
  }, []);

  // Live-update the activity feed. The Bleepforge:save event fires on
  // every save (outgoing + incoming) from main.tsx's saves SSE bridge,
  // so we prepend each to the feed and trim to FEED_LIMIT.
  useEffect(() => {
    const handler = (e: CustomEvent<SaveEntry>) => {
      setRecentSaves((prev) => [e.detail, ...prev].slice(0, FEED_LIMIT));
    };
    window.addEventListener("Bleepforge:save", handler as EventListener);
    return () =>
      window.removeEventListener(
        "Bleepforge:save",
        handler as EventListener,
      );
  }, []);

  if (!catalog) return <PixelSkeleton />;

  const issues = computeIssues(catalog);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ConceptHeader concept={concept} />
      <StatsGrid catalog={catalog} assetCount={assetCount} />
      <ActivityFeed entries={recentSaves} />
      <IntegrityStrip
        errorCount={errorCount}
        warningCount={warningCount}
      />
    </div>
  );
}

// ---- Concept header strip --------------------------------------------------

function ConceptHeader({ concept }: { concept: Concept | null }) {
  const title = concept?.Title?.trim() || "Untitled project";
  const tagline = concept?.Tagline?.trim();
  const logo = concept?.Logo?.trim() || "";

  return (
    <Link
      to="/concept"
      className="card-lift flex items-center gap-4 border-2 border-neutral-800 bg-neutral-900/60 p-4 transition-colors hover:border-emerald-700 hover:bg-neutral-900"
      aria-label="Open the game concept page"
    >
      {logo ? (
        <AssetThumb path={logo} size="lg" />
      ) : (
        <LogoPlaceholder className="size-16 shrink-0 text-neutral-700" />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl tracking-wider text-emerald-300">
          {title}
        </h1>
        {tagline ? (
          <p className="mt-1 truncate text-sm italic text-neutral-400">
            {tagline}
          </p>
        ) : (
          <p className="mt-1 text-xs text-neutral-600">
            No tagline yet — click to edit the project concept.
          </p>
        )}
      </div>
      <span
        className="shrink-0 font-mono text-xs text-neutral-600"
        aria-hidden="true"
      >
        →
      </span>
    </Link>
  );
}

// ---- Stats grid ------------------------------------------------------------

interface StatTile {
  label: string;
  count: number | null;
  route: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}

function StatsGrid({
  catalog,
  assetCount,
}: {
  catalog: ReturnType<typeof useCatalog> extends infer T ? NonNullable<T> : never;
  assetCount: number | null;
}) {
  const tiles: StatTile[] = [
    { label: "NPCs", count: catalog.npcs.length, route: "/npcs", Icon: RobotIcon },
    { label: "Quests", count: catalog.quests.length, route: "/quests", Icon: ScrollIcon },
    { label: "Items", count: catalog.items.length, route: "/items", Icon: CrateIcon },
    { label: "Karma", count: catalog.karma.length, route: "/karma", Icon: ScaleIcon },
    { label: "Factions", count: catalog.factions.length, route: "/factions", Icon: ShieldIcon },
    { label: "Dialogs", count: catalog.sequences.length, route: "/dialogs", Icon: BubbleIcon },
    { label: "Balloons", count: catalog.balloonRefs.length, route: "/balloons", Icon: BalloonIcon },
    { label: "Codex", count: catalog.codexEntries.length, route: "/codex", Icon: BookIcon },
    { label: "Shaders", count: catalog.shaders.length, route: "/shaders", Icon: ShaderIcon },
    { label: "Assets", count: assetCount, route: "/assets", Icon: FrameIcon },
  ];

  return (
    <section>
      <h2 className="mb-3 font-display text-xs tracking-wider text-emerald-400">
        PROJECT
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <StatTileEl key={tile.label} tile={tile} />
        ))}
      </div>
    </section>
  );
}

function StatTileEl({ tile }: { tile: StatTile }) {
  const { Icon } = tile;
  return (
    <Link
      to={tile.route}
      className="card-lift group flex flex-col items-start gap-2 border-2 border-neutral-800 bg-neutral-900/40 p-3 transition-colors hover:border-emerald-700 hover:bg-neutral-900"
    >
      <span className="text-neutral-500 group-hover:text-emerald-400">
        <Icon />
      </span>
      <span className="font-display text-2xl tracking-wider text-emerald-300">
        {tile.count === null ? "—" : tile.count}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300">
        {tile.label}
      </span>
    </Link>
  );
}

// ---- Activity feed ---------------------------------------------------------

function ActivityFeed({ entries }: { entries: SaveEntry[] }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xs tracking-wider text-emerald-400">
        RECENT ACTIVITY
      </h2>
      {entries.length === 0 ? (
        <p className="border-2 border-dashed border-neutral-800 bg-neutral-900/30 p-4 text-center text-sm text-neutral-500">
          No saves yet. Edit anything and it'll show up here.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 border-2 border-neutral-800 bg-neutral-900/40">
          {entries.map((entry, idx) => (
            <li key={`${entry.ts}-${idx}`}>
              <ActivityRow entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRow({ entry }: { entry: SaveEntry }) {
  const info = DOMAIN_LABELS[entry.domain];
  const label = info?.label ?? entry.domain;
  const route =
    info && entry.action === "deleted"
      ? info.deletedRoute(entry.key)
      : info?.updatedRoute(entry.key);
  const directionLabel = entry.direction === "outgoing" ? "OUT" : "IN";
  const directionClass =
    entry.direction === "outgoing"
      ? "border-cyan-700/60 bg-cyan-950/40 text-cyan-300"
      : "border-emerald-700/60 bg-emerald-950/40 text-emerald-300";
  const outcomeGlyph =
    entry.outcome === "error" ? "✗" : entry.outcome === "warning" ? "⚠" : "✓";
  const outcomeColor =
    entry.outcome === "error"
      ? "text-red-400"
      : entry.outcome === "warning"
        ? "text-amber-400"
        : "text-neutral-600";

  const content = (
    <div className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-neutral-900">
      <span
        className={`shrink-0 border px-1.5 py-0.5 font-mono text-[10px] font-bold ${directionClass}`}
      >
        {directionLabel}
      </span>
      <span className={`shrink-0 font-mono text-xs ${outcomeColor}`}>
        {outcomeGlyph}
      </span>
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-300">
        {entry.key}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-neutral-600">
        {relativeTime(entry.ts)}
      </span>
    </div>
  );

  if (route) {
    return (
      <Link to={route} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---- Integrity strip -------------------------------------------------------

function IntegrityStrip({
  errorCount,
  warningCount,
}: {
  errorCount: number;
  warningCount: number;
}) {
  const clean = errorCount === 0 && warningCount === 0;
  const total = errorCount + warningCount;
  const summary = clean
    ? "All checks passing"
    : errorCount > 0
      ? `${errorCount} error${errorCount === 1 ? "" : "s"}${warningCount > 0 ? `, ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}`
      : `${warningCount} warning${warningCount === 1 ? "" : "s"}`;
  const tone = clean
    ? "border-emerald-800 text-emerald-300"
    : errorCount > 0
      ? "border-red-800 text-red-300"
      : "border-amber-800 text-amber-300";
  const glyph = clean ? "✓" : errorCount > 0 ? "✗" : "⚠";

  return (
    <section>
      <Link
        to={clean ? "/diagnostics" : "/diagnostics/integrity"}
        className={`card-lift flex items-center justify-between gap-3 border-2 ${tone} bg-neutral-900/40 px-4 py-3 transition-colors hover:bg-neutral-900`}
      >
        <span className="flex items-center gap-3">
          <span className="font-mono text-base">{glyph}</span>
          <span className="font-display text-xs tracking-wider">
            INTEGRITY
          </span>
          <span className="font-mono text-xs text-neutral-400">{summary}</span>
        </span>
        <span className="font-mono text-xs text-neutral-500">
          {total > 0 ? "View diagnostics →" : "View →"}
        </span>
      </Link>
    </section>
  );
}
