import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { HelpCategoryGroup } from "@bleepforge/shared";
import { paletteColorClasses } from "../../lib/paletteColor";

// In-page Help search. Indexes Title + Section + Summary + Body across
// every entry in every category. Distinct from the global AppSearch
// (Ctrl+K), which only indexes Title + Summary so it doesn't drown the
// rest of the corpus in body-text noise. Inside Help, the user has
// already opted in to "I want to find help content," so wider coverage
// is the right tradeoff.
//
// Substring-only (no fuzzy matching), case-insensitive. Each match
// surfaces a snippet with the matched string highlighted, so the user
// sees which paragraph the hit came from before clicking through.
//
// Keyboard:
//   /         focus the input from anywhere on the Help page
//   Esc       blur and clear
//   ↑ / ↓     walk results
//   Enter     navigate to the active result

interface HelpSearchProps {
  /** All categories with their entries. */
  groups: HelpCategoryGroup[];
  /** When set, narrows search to a single category. Used by CategoryView. */
  scopeCategory?: string;
}

interface SearchHit {
  category: string;
  categoryDisplay: string;
  categoryColor: ReturnType<typeof paletteColorClasses>;
  entryId: string;
  entryTitle: string;
  section: string;
  href: string;
  snippet: string;
  matchStart: number;
  matchLen: number;
}

const SNIPPET_RADIUS = 50;
const RESULT_LIMIT = 30;

export function HelpSearch({ groups, scopeCategory }: HelpSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchHit[] = [];
    for (const group of groups) {
      if (scopeCategory && group.category !== scopeCategory) continue;
      const palette = paletteColorClasses(group.meta.Color);
      const display = group.meta.DisplayName || group.category;
      for (const entry of group.entries) {
        const haystacks: { text: string; field: "title" | "section" | "summary" | "body" }[] = [
          { text: entry.Title, field: "title" },
          { text: entry.Section, field: "section" },
          { text: entry.Summary, field: "summary" },
          { text: entry.Body, field: "body" },
        ];
        let best: { idx: number; field: string; text: string } | null = null;
        for (const h of haystacks) {
          if (!h.text) continue;
          const at = h.text.toLowerCase().indexOf(q);
          if (at === -1) continue;
          // Title hits beat all others; otherwise prefer the earliest
          // match in the longest haystack (Body), then summary, etc.
          const fieldRank = h.field === "title" ? 0 : h.field === "summary" ? 1 : h.field === "section" ? 2 : 3;
          const bestRank = best ? (best.field === "title" ? 0 : best.field === "summary" ? 1 : best.field === "section" ? 2 : 3) : 99;
          if (!best || fieldRank < bestRank) {
            best = { idx: at, field: h.field, text: h.text };
          }
        }
        if (!best) continue;
        const start = Math.max(0, best.idx - SNIPPET_RADIUS);
        const end = Math.min(best.text.length, best.idx + q.length + SNIPPET_RADIUS);
        const prefix = start > 0 ? "…" : "";
        const suffix = end < best.text.length ? "…" : "";
        const snippet = `${prefix}${best.text.slice(start, end)}${suffix}`;
        out.push({
          category: group.category,
          categoryDisplay: display,
          categoryColor: palette,
          entryId: entry.Id,
          entryTitle: entry.Title || entry.Id,
          section: entry.Section,
          href: `/help/${encodeURIComponent(group.category)}/${encodeURIComponent(entry.Id)}`,
          snippet,
          matchStart: best.idx - start + prefix.length,
          matchLen: q.length,
        });
        if (out.length >= RESULT_LIMIT) break;
      }
      if (out.length >= RESULT_LIMIT) break;
    }
    return out;
  }, [groups, query, scopeCategory]);

  // Slash-key shortcut, scoped to "while a Help page is mounted." Skipped
  // when the user is already typing in another input or textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const pick = (hit: SearchHit) => {
    navigate(hit.href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const target = hits[activeIdx] ?? hits[0];
      if (target) {
        e.preventDefault();
        pick(target);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) setQuery("");
      else inputRef.current?.blur();
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="search"
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
        placeholder={
          scopeCategory
            ? `Search this category…  press / to focus`
            : `Search all help…  press / to focus`
        }
        spellCheck={false}
        autoComplete="off"
        className="w-full border-2 border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition-colors placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto border-2 border-neutral-800 bg-neutral-950 shadow-lg">
          {hits.length === 0 ? (
            <div className="px-3 py-3 text-xs text-neutral-500">No matches.</div>
          ) : (
            <ul>
              {hits.map((hit, i) => {
                const active = i === activeIdx;
                const before = hit.snippet.slice(0, hit.matchStart);
                const middle = hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLen);
                const after = hit.snippet.slice(hit.matchStart + hit.matchLen);
                return (
                  <li key={`${hit.category}/${hit.entryId}`} ref={active ? activeRef : undefined}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => pick(hit)}
                      className={`flex w-full flex-col items-start gap-1 border-b border-neutral-900 px-3 py-2 text-left ${
                        active
                          ? "bg-emerald-950/40 text-emerald-100"
                          : "text-neutral-200 hover:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`inline-block size-2 ${hit.categoryColor.stripe}`}
                        />
                        <span className={hit.categoryColor.text}>
                          {hit.categoryDisplay}
                        </span>
                        <span className="text-neutral-600">/</span>
                        <span className="font-medium">{hit.entryTitle}</span>
                        {hit.section && (
                          <span className="text-[10px] text-neutral-600">
                            in {hit.section}
                          </span>
                        )}
                      </div>
                      <div className="text-xs leading-snug text-neutral-400">
                        {before}
                        <mark className="bg-emerald-700/50 px-0.5 text-emerald-100">
                          {middle}
                        </mark>
                        {after}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {!showDropdown && query.trim().length === 0 && (
        <div className="mt-1 text-[10px] text-neutral-600">
          Press / from anywhere on the Help page to jump back here.
        </div>
      )}
      {!showDropdown && query.trim().length > 0 && (
        <div className="mt-1 text-[10px] text-neutral-600">
          {hits.length} match{hits.length === 1 ? "" : "es"}.{" "}
          <Link to="" onClick={(e) => { e.preventDefault(); setOpen(true); }} className="text-emerald-400 hover:text-emerald-300 underline">
            show
          </Link>
        </div>
      )}
    </div>
  );
}
