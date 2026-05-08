import { useEffect, useState } from "react";
import type { DialogSourceType } from "@bleepforge/shared";

// Three-state segmented control for the SourceType filter. Mirrors the
// FolderTabs visual rhythm so the two read as a paired control row when
// rendered side-by-side. Lives outside Graph.tsx because the list view also
// needs it — same filter, same component.

export type DialogSourceFilter = "all" | DialogSourceType;

const STORAGE_KEY = "bleepforge:dialogSourceFilter";

// Persisted to localStorage so toggling between Graph and List keeps the
// active filter. Cross-tab sync via the storage event so two open windows
// stay in sync if you flip the filter in one.
export function useDialogSourceFilter(): [
  DialogSourceFilter,
  (v: DialogSourceFilter) => void,
] {
  const [value, setValueState] = useState<DialogSourceFilter>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "Npc" || v === "Terminal" || v === "all") return v;
    } catch {
      // ignore
    }
    return "all";
  });
  const setValue = (v: DialogSourceFilter) => {
    setValueState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // ignore
    }
  };
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      if (v === "Npc" || v === "Terminal" || v === "all") setValueState(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return [value, setValue];
}

interface Props {
  value: DialogSourceFilter;
  onChange: (v: DialogSourceFilter) => void;
}

// Color always visible (so NPC reads as orangish and Terminal as greenish at
// rest, not only when selected). Active state cues:
//   1. inset ring (visible "selected" outline without layout shift)
//   2. brighter text + border + heavier background tint
//   3. subtle pixel offset shadow so the active button "lifts off" the row
function buttonClasses(id: DialogSourceFilter, active: boolean): string {
  if (id === "all") {
    return active
      ? "border-neutral-400 bg-neutral-800 text-neutral-100 ring-1 ring-inset ring-neutral-300 shadow-[2px_2px_0_0_rgba(0,0,0,0.45)]"
      : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-800/60 hover:text-neutral-200";
  }
  if (id === "Npc") {
    return active
      ? "border-source-npc-400 bg-source-npc-950/55 text-source-npc-100 ring-1 ring-inset ring-source-npc-300 shadow-[2px_2px_0_0_rgba(0,0,0,0.45)]"
      : "border-source-npc-800 bg-source-npc-950/15 text-source-npc-400 hover:border-source-npc-600 hover:bg-source-npc-950/30 hover:text-source-npc-200";
  }
  return active
    ? "border-source-terminal-400 bg-source-terminal-950/55 text-source-terminal-100 ring-1 ring-inset ring-source-terminal-300 shadow-[2px_2px_0_0_rgba(0,0,0,0.45)]"
    : "border-source-terminal-800 bg-source-terminal-950/15 text-source-terminal-400 hover:border-source-terminal-600 hover:bg-source-terminal-950/30 hover:text-source-terminal-200";
}

export function SourceFilter({ value, onChange }: Props) {
  const options: { id: DialogSourceFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "Npc", label: "NPC" },
    { id: "Terminal", label: "Terminal" },
  ];
  return (
    <div
      className="flex shrink-0 gap-1 text-xs"
      role="radiogroup"
      aria-label="Source type filter"
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`border-2 px-2 py-1 transition-all ${buttonClasses(o.id, active)}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
