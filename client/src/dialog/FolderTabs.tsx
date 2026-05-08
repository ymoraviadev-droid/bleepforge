import { Link } from "react-router";
import type { DialogSourceType } from "@bleepforge/shared";

interface Props {
  folders: string[];
  selected: string | null;
  basePath: string;
  // Types present in each folder. When supplied, a small colored square
  // appears inside each tab — emerald for folders that contain NPC dialogs,
  // sky for folders with Terminal dialogs (both, when a folder has both).
  // Matches the SourceFilter's color language so the two controls read as a
  // pair. Optional so callers that don't need the cue can omit it.
  typesByFolder?: Map<string, DialogSourceType[]>;
}

export function FolderTabs({
  folders,
  selected,
  basePath,
  typesByFolder,
}: Props) {
  if (folders.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-800 pb-2">
      {folders.map((f) => {
        const isActive = f === selected;
        const types = typesByFolder?.get(f);
        return (
          <Link
            key={f}
            to={`${basePath}?folder=${encodeURIComponent(f)}`}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm transition-colors ${
              isActive
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            {types && types.length > 0 && <TypeDots types={types} />}
            <span>{f}</span>
          </Link>
        );
      })}
    </div>
  );
}

// Small colored squares signaling which SourceTypes the folder contains.
// Pixel-themed (no rounded), 6px so they don't overpower the tab label.
// `shapeRendering="crispEdges"` is implicit because they're plain CSS boxes.
function TypeDots({ types }: { types: DialogSourceType[] }) {
  const set = new Set(types);
  const hasNpc = set.has("Npc");
  const hasTerminal = set.has("Terminal");
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {hasNpc && (
        <span
          aria-hidden="true"
          title="Contains NPC dialogs"
          className="block size-1.5 bg-source-npc-500"
        />
      )}
      {hasTerminal && (
        <span
          aria-hidden="true"
          title="Contains Terminal dialogs"
          className="block size-1.5 bg-source-terminal-500"
        />
      )}
    </span>
  );
}
