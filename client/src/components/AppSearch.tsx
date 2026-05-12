import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useCatalog } from "../lib/useCatalog";
import {
  buildSearchFuse,
  buildSearchItems,
  type SearchItem,
  type SearchKind,
} from "../lib/search/buildIndex";

// Full domain names rather than 3-letter acronyms — informative beats compact
// when the badge is the primary "what kind of thing is this row" cue. Uses
// the singular form to match the per-row context (one NPC, one Item, ...).
const KIND_LABEL: Record<SearchKind, string> = {
  npc: "NPC",
  item: "Item",
  quest: "Quest",
  karma: "Karma",
  faction: "Faction",
  dialog: "Dialog",
  balloon: "Balloon",
  codex: "Codex",
  shader: "Shader",
  page: "Page",
};

// One stable hue per kind so users learn the color → domain mapping. Pulled
// from Tailwind palettes that don't get retinted by the global theme system
// (the theme switch only re-points emerald + neutrals), so a Quest badge
// stays red whether the active theme is dark, amber, or cyan. Emerald is
// avoided here because it's the active-row color in the dropdown — letting a
// kind own it would muddy the "this row is selected" cue.
const KIND_STYLE: Record<SearchKind, string> = {
  npc: "border-amber-700/60 text-amber-300",
  item: "border-cyan-700/60 text-cyan-300",
  quest: "border-red-700/60 text-red-300",
  karma: "border-violet-700/60 text-violet-300",
  faction: "border-orange-700/60 text-orange-300",
  dialog: "border-blue-700/60 text-blue-300",
  balloon: "border-pink-700/60 text-pink-300",
  // Codex entries use a fixed slate badge — per-category color lives on the
  // list page section header, not on the search row. Keeps per-kind color
  // stable across all categories so the user learns "slate = codex" once.
  codex: "border-slate-700/60 text-slate-300",
  // Lime reads "electric / CRT" and matches the shader gallery cards'
  // canvas_item tint, so the search-row badge feels like the same surface
  // even before the user opens it.
  shader: "border-lime-700/60 text-lime-300",
  page: "border-neutral-700/60 text-neutral-400",
};

const RESULT_LIMIT = 30;

function KindBadge({ kind }: { kind: SearchKind }) {
  return (
    <span
      className={`mt-0.5 inline-flex h-4 w-16 shrink-0 items-center justify-center border bg-neutral-900 font-mono text-[9px] uppercase ${KIND_STYLE[kind]}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function SearchIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x="2" y="1" width="3" height="1" />
      <rect x="1" y="2" width="1" height="3" />
      <rect x="5" y="2" width="1" height="3" />
      <rect x="2" y="5" width="3" height="1" />
      <rect x="6" y="6" width="1" height="1" />
      <rect x="7" y="7" width="1" height="1" />
      <rect x="8" y="8" width="2" height="2" />
    </svg>
  );
}

export function AppSearch() {
  const catalog = useCatalog();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const fuse = useMemo(
    () => (catalog ? buildSearchFuse(buildSearchItems(catalog)) : null),
    [catalog],
  );

  const results = useMemo<SearchItem[]>(() => {
    if (!fuse) return [];
    const q = query.trim();
    if (!q) return [];
    return fuse.search(q, { limit: RESULT_LIMIT }).map((r) => r.item);
  }, [fuse, query]);

  // Cmd/Ctrl+K from anywhere → focus + select. Universal palette shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside the widget closes the dropdown without clearing the query —
  // matches Slack / GitHub behavior; user can re-focus to reopen with the
  // last query intact.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the active row visible as ↑↓ navigation walks past the dropdown's
  // scroll fold.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const pick = (item: SearchItem) => {
    navigate(item.href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const target = results[activeIdx] ?? results[0];
      if (target) {
        e.preventDefault();
        pick(target);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
      } else {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-neutral-500">
        <SearchIcon />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        aria-label="Search Bleepforge"
        spellCheck={false}
        autoComplete="off"
        className="w-56 border-2 border-neutral-700 bg-neutral-900 py-1 pl-7 pr-12 text-sm text-neutral-100 transition-colors placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute inset-y-0 right-1.5 my-1 flex items-center border border-neutral-700 bg-neutral-950 px-1 font-mono text-[10px] text-neutral-500">
        Ctrl+K
      </kbd>
      {showDropdown && (
        <div className="absolute right-0 top-full z-50 mt-1 w-96 border-2 border-neutral-800 bg-neutral-950 shadow-lg">
          {!catalog ? (
            <div className="px-3 py-2 text-xs text-neutral-500">Loading…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-500">No matches.</div>
          ) : (
            <ul className="max-h-112 overflow-y-auto">
              {results.map((r, i) => {
                const active = i === activeIdx;
                const secondary = [r.sublabel, r.context].filter(Boolean).join(" · ");
                return (
                  <li key={r.key} ref={active ? activeRef : undefined}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => pick(r)}
                      className={`flex w-full items-start gap-2 px-2 py-1.5 text-left ${
                        active
                          ? "bg-emerald-950/40 text-emerald-100"
                          : "text-neutral-200 hover:bg-neutral-900"
                      }`}
                    >
                      <KindBadge kind={r.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {r.label.replace(/\s+/g, " ")}
                        </div>
                        {secondary && (
                          <div className="truncate font-mono text-[11px] text-neutral-500">
                            {secondary}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
