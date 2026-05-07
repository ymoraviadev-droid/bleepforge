import { useEffect, useState } from "react";
import { Button } from "../Button";
import { refreshCatalog } from "../catalog-bus";
import { fieldLabel, textInput } from "../ui";

interface DomainResult {
  imported: string[];
  skipped: { file: string; reason: string }[];
  errors: { file: string; error: string }[];
}
interface DialogDomainResult {
  imported: { folder: string; id: string; file: string }[];
  skipped: { folder: string; file: string; reason: string }[];
  errors: { folder: string; file: string; error: string }[];
}
interface ImportResult {
  ok: boolean;
  godotProjectRoot: string;
  dryRun: boolean;
  domains: {
    items: DomainResult;
    quests: DomainResult;
    karma: DomainResult;
    dialogs: DialogDomainResult;
  };
}

const DEFAULT_GODOT_ROOT = "/home/ymoravia/Data/Projects/Godot/astro-man";
const ROOT_STORAGE_KEY = "bleepforge:godotRoot";

export function ImportSection() {
  const [root, setRoot] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_GODOT_ROOT;
    try {
      return window.localStorage.getItem(ROOT_STORAGE_KEY) ?? DEFAULT_GODOT_ROOT;
    } catch {
      return DEFAULT_GODOT_ROOT;
    }
  });
  const [dryRun, setDryRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(ROOT_STORAGE_KEY, root);
    } catch {}
  }, [root]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ godotProjectRoot: root, dryRun }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      } else {
        setResult(data);
        if (!dryRun) refreshCatalog();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-400">
        Read <span className="font-mono">.tres</span> files from your Flock of
        Bleeps Godot project and write the matching JSON into Bleepforge's{" "}
        <span className="font-mono">data/</span> folder. Existing JSON files
        with the same id get overwritten.
      </p>

      <label className="block">
        <span className={fieldLabel}>Godot project root</span>
        <input
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          placeholder="/path/to/Godot/astro-man"
          className={`${textInput} font-mono text-sm`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="size-4"
        />
        <span>
          Dry run — parse + report what would be imported, don't write JSON
        </span>
      </label>
      <div className="flex justify-end">
        <Button onClick={run} disabled={running || !root.trim()}>
          {running ? "Running…" : dryRun ? "Run dry import" : "Run import"}
        </Button>
      </div>
      {error && (
        <div className="border-2 border-red-800 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="text-xs text-neutral-400">
            {result.dryRun ? "Dry run on " : "Imported from "}
            <span className="font-mono text-neutral-200">
              {result.godotProjectRoot}
            </span>
          </div>

          <DomainCard
            title="Items"
            counts={summarize(result.domains.items)}
            imported={result.domains.items.imported.map((s) => ({ label: s }))}
            skipped={result.domains.items.skipped.map((s) => ({
              label: relativize(s.file, result.godotProjectRoot),
              detail: s.reason,
            }))}
            errors={result.domains.items.errors.map((e) => ({
              label: relativize(e.file, result.godotProjectRoot),
              detail: e.error,
            }))}
          />

          <DomainCard
            title="Quests"
            counts={summarize(result.domains.quests)}
            imported={result.domains.quests.imported.map((s) => ({ label: s }))}
            skipped={result.domains.quests.skipped.map((s) => ({
              label: relativize(s.file, result.godotProjectRoot),
              detail: s.reason,
            }))}
            errors={result.domains.quests.errors.map((e) => ({
              label: relativize(e.file, result.godotProjectRoot),
              detail: e.error,
            }))}
          />

          <DomainCard
            title="Karma impacts"
            counts={summarize(result.domains.karma)}
            imported={result.domains.karma.imported.map((s) => ({ label: s }))}
            skipped={result.domains.karma.skipped.map((s) => ({
              label: relativize(s.file, result.godotProjectRoot),
              detail: s.reason,
            }))}
            errors={result.domains.karma.errors.map((e) => ({
              label: relativize(e.file, result.godotProjectRoot),
              detail: e.error,
            }))}
          />

          <DialogDomainCard
            title="Dialogs"
            data={result.domains.dialogs}
            root={result.godotProjectRoot}
          />
        </div>
      )}
    </div>
  );
}

function summarize(d: DomainResult | DialogDomainResult): {
  imported: number;
  skipped: number;
  errors: number;
} {
  return {
    imported: d.imported.length,
    skipped: d.skipped.length,
    errors: d.errors.length,
  };
}

function relativize(file: string, root: string): string {
  if (file.startsWith(root + "/")) return file.substring(root.length + 1);
  return file;
}

function DomainCard({
  title,
  counts,
  imported,
  skipped,
  errors,
}: {
  title: string;
  counts: { imported: number; skipped: number; errors: number };
  imported: { label: string }[];
  skipped: { label: string; detail: string }[];
  errors: { label: string; detail: string }[];
}) {
  return (
    <section className="border-2 border-neutral-800">
      <header className="flex items-center justify-between border-b-2 border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
        <span className="font-semibold text-neutral-100">{title}</span>
        <span className="flex gap-3 text-xs">
          <span className="text-emerald-400">{counts.imported} imported</span>
          {counts.skipped > 0 && (
            <span className="text-amber-400">{counts.skipped} skipped</span>
          )}
          {counts.errors > 0 && (
            <span className="text-red-400">{counts.errors} errors</span>
          )}
        </span>
      </header>
      {(imported.length > 0 || skipped.length > 0 || errors.length > 0) && (
        <div className="space-y-2 p-3 text-xs">
          {imported.length > 0 && (
            <details>
              <summary className="cursor-pointer text-emerald-400">
                {imported.length} imported
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 font-mono text-neutral-300">
                {imported.map((x, i) => (
                  <li key={i}>{x.label}</li>
                ))}
              </ul>
            </details>
          )}
          {skipped.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-amber-400">
                {skipped.length} skipped
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-neutral-300">
                {skipped.map((x, i) => (
                  <li key={i}>
                    <span className="font-mono">{x.label}</span> —{" "}
                    <span className="text-neutral-500">{x.detail}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {errors.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-red-400">
                {errors.length} errors
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-neutral-300">
                {errors.map((x, i) => (
                  <li key={i}>
                    <span className="font-mono">{x.label}</span> —{" "}
                    <span className="text-red-300">{x.detail}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function DialogDomainCard({
  title,
  data,
  root,
}: {
  title: string;
  data: DialogDomainResult;
  root: string;
}) {
  const byFolder = new Map<string, string[]>();
  for (const x of data.imported) {
    const list = byFolder.get(x.folder) ?? [];
    list.push(x.id);
    byFolder.set(x.folder, list);
  }

  return (
    <section className="border-2 border-neutral-800">
      <header className="flex items-center justify-between border-b-2 border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
        <span className="font-semibold text-neutral-100">{title}</span>
        <span className="flex gap-3 text-xs">
          <span className="text-emerald-400">
            {data.imported.length} imported
          </span>
          {data.skipped.length > 0 && (
            <span className="text-amber-400">
              {data.skipped.length} skipped
            </span>
          )}
          {data.errors.length > 0 && (
            <span className="text-red-400">{data.errors.length} errors</span>
          )}
        </span>
      </header>
      {byFolder.size > 0 && (
        <div className="space-y-2 p-3 text-xs">
          {[...byFolder.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([folder, ids]) => (
              <details key={folder}>
                <summary className="cursor-pointer text-neutral-200">
                  <span className="font-mono">{folder}</span>{" "}
                  <span className="text-neutral-500">({ids.length})</span>
                </summary>
                <ul className="mt-1 space-y-0.5 pl-4 font-mono text-neutral-300">
                  {ids.sort().map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              </details>
            ))}
        </div>
      )}
      {data.skipped.length > 0 && (
        <div className="space-y-1 border-t-2 border-neutral-800 p-3 text-xs">
          <div className="text-amber-400">Skipped:</div>
          <ul className="space-y-0.5 pl-2 text-neutral-300">
            {data.skipped.map((s, i) => (
              <li key={i}>
                <span className="font-mono">
                  {s.folder}/{relativize(s.file, root)}
                </span>{" "}
                — <span className="text-neutral-500">{s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.errors.length > 0 && (
        <div className="space-y-1 border-t-2 border-neutral-800 p-3 text-xs">
          <div className="text-red-400">Errors:</div>
          <ul className="space-y-0.5 pl-2 text-neutral-300">
            {data.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">
                  {e.folder}/{relativize(e.file, root)}
                </span>{" "}
                — <span className="text-red-300">{e.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
