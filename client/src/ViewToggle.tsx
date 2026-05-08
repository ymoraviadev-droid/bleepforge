import { useEffect, useState } from "react";

export type ViewMode = "cards" | "list";

const STORAGE_PREFIX = "bleepforge:viewMode:";

// Per-domain, persisted to localStorage. Defaults to "cards" so the existing
// card layout is what users see on first load.
export function useViewMode(domain: string): [ViewMode, (m: ViewMode) => void] {
  const key = STORAGE_PREFIX + domain;
  const [mode, setModeState] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === "list" ? "list" : "cards";
    } catch {
      return "cards";
    }
  });
  const setMode = (m: ViewMode) => {
    setModeState(m);
    try {
      localStorage.setItem(key, m);
    } catch {
      // ignore — quota / privacy mode
    }
  };
  // Sync across tabs / windows when the same key is updated elsewhere.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      const v = e.newValue;
      if (v === "list" || v === "cards") setModeState(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  return [mode, setMode];
}

interface Props {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ mode, onChange, className = "" }: Props) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className={`${className} inline-flex rounded border border-neutral-800 bg-neutral-900`}
    >
      <ToggleButton
        active={mode === "cards"}
        onClick={() => onChange("cards")}
        title="Card view"
      >
        <CardsIcon />
      </ToggleButton>
      <ToggleButton
        active={mode === "list"}
        onClick={() => onChange("list")}
        title="List view"
      >
        <ListIcon />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex size-7 items-center justify-center transition-colors ${
        active
          ? "bg-emerald-950/60 text-emerald-300"
          : "text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function CardsIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="14"
      height="14"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="4" height="4" />
      <rect x="7" y="1" width="4" height="4" />
      <rect x="1" y="7" width="4" height="4" />
      <rect x="7" y="7" width="4" height="4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="14"
      height="14"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="2" width="10" height="2" />
      <rect x="1" y="5" width="10" height="2" />
      <rect x="1" y="8" width="10" height="2" />
    </svg>
  );
}
