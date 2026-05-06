import { Link } from "react-router";

interface Props {
  folders: string[];
  selected: string | null;
  basePath: string;
}

export function FolderTabs({ folders, selected, basePath }: Props) {
  if (folders.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-800 pb-2">
      {folders.map((f) => {
        const isActive = f === selected;
        return (
          <Link
            key={f}
            to={`${basePath}?folder=${encodeURIComponent(f)}`}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              isActive
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            {f}
          </Link>
        );
      })}
    </div>
  );
}
