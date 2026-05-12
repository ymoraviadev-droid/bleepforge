import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { ButtonLink } from "../../components/Button";
import { NotFoundPage } from "../../components/NotFoundPage";
import type { ShaderAsset, ShaderUsage } from "../../lib/api";
import { shadersApi } from "../../lib/api";
import {
  fmtBytes,
  shaderTypeLabel,
  shaderTypeStyle,
} from "./format";
import { ShaderUsagesPanel } from "./UsagesPanel";

// Shader detail page. Phase 1 is view-only: source on the left, info +
// usages on the right. Phase 2 will swap the `<pre>` source block for a
// CodeMirror editor with GDShader syntax highlighting + save, plus
// import / duplicate / delete buttons in the header. Phase 3 adds the
// preview canvas alongside the editor with the live WebGL2 + uniform
// controls.
//
// Path comes via ?path= so the URL stays valid for any shader regardless
// of folder depth (basename alone wouldn't work — two shaders in different
// folders could share a name). The asset surface uses the same shape for
// its (so-far-internal) editor host.

export function ShaderEdit() {
  const [searchParams] = useSearchParams();
  const path = searchParams.get("path") ?? "";

  const [asset, setAsset] = useState<ShaderAsset | null>(null);
  const [source, setSource] = useState<string>("");
  const [usages, setUsages] = useState<ShaderUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usagesError, setUsagesError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!path) {
      setError("no path provided");
      return;
    }
    setNotFound(false);
    setError(null);
    shadersApi
      .getFile(path)
      .then((r) => {
        if (!r.asset) {
          setNotFound(true);
          return;
        }
        setAsset(r.asset);
        setSource(r.source);
      })
      .catch((e) => {
        const msg = String(e);
        // Server responds 404 when the file doesn't exist; map that
        // to the standard NotFoundPage rather than the inline error
        // since "you visited a URL for a shader that's gone" is the
        // same shape as the other entity-edit pages' 404 path.
        if (msg.includes("404")) setNotFound(true);
        else setError(msg);
      });
  }, [path]);

  useEffect(() => {
    if (!path || notFound) return;
    setUsagesError(null);
    shadersApi
      .usages(path)
      .then((r) => setUsages(r.usages))
      .catch((e) => setUsagesError(String(e)));
  }, [path, notFound]);

  const lineCount = useMemo(
    () => (source ? source.split("\n").length : 0),
    [source],
  );

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (!asset) return <div className="text-neutral-500">Loading…</div>;

  const style = shaderTypeStyle(asset.shaderType);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1
            className="truncate font-mono text-lg text-neutral-100"
            title={asset.basename}
          >
            {asset.basename}
          </h1>
          {asset.parentRel && (
            <div
              className="truncate font-mono text-xs text-emerald-500/80"
              title={asset.parentRel}
            >
              {asset.parentRel}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <ButtonLink to="/shaders" variant="secondary">
            ← Back
          </ButtonLink>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span
          className={`border px-1.5 py-0.5 ${style.border} ${style.text} bg-neutral-950`}
        >
          shader_type {shaderTypeLabel(asset.shaderType)}
        </span>
        <span className="border border-neutral-800 px-1.5 py-0.5 text-neutral-400">
          {asset.uniformCount} uniform{asset.uniformCount === 1 ? "" : "s"}
        </span>
        <span className="border border-neutral-800 px-1.5 py-0.5 text-neutral-400">
          {lineCount} line{lineCount === 1 ? "" : "s"}
        </span>
        <span className="border border-neutral-800 px-1.5 py-0.5 text-neutral-400">
          {fmtBytes(asset.sizeBytes)}
        </span>
        {asset.uid && (
          <span
            className="truncate border border-neutral-800 px-1.5 py-0.5 normal-case text-neutral-500"
            title={asset.uid}
            style={{ maxWidth: "12rem" }}
          >
            {asset.uid}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <SourceBlock source={source} />
        <ShaderUsagesPanel usages={usages} error={usagesError} />
      </div>

      <div className="border-t-2 border-neutral-800/60 pt-3 font-mono text-[10px] text-neutral-600">
        Phase 1 of the shader work — view-only. Phase 2 brings in CodeMirror
        + save, Phase 3 the GDShader → GLSL ES translator + a live WebGL
        preview canvas you can point at any image.
      </div>
    </div>
  );
}

// Phase 1 source view: monospace `<pre>` with line numbers in a left
// gutter. Plain text — no syntax highlighting. CodeMirror lands in
// Phase 2 with proper GDShader highlighting + edit affordances; the
// styled <pre> here is the simplest shape that still reads as a code
// viewer rather than a raw text blob.
function SourceBlock({ source }: { source: string }) {
  const lines = useMemo(() => (source ? source.split("\n") : []), [source]);
  return (
    <section className="overflow-hidden border-2 border-neutral-800 bg-neutral-950">
      <header className="border-b-2 border-neutral-800 px-3 py-2">
        <h2 className="font-display text-xs uppercase tracking-wider text-neutral-300">
          Source
        </h2>
      </header>
      <pre className="max-h-[70vh] overflow-auto p-0 font-mono text-xs leading-relaxed text-neutral-200">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span
                className="sticky left-0 inline-block w-10 shrink-0 select-none border-r border-neutral-800/80 bg-neutral-950 px-2 py-0 text-right text-[10px] text-neutral-600"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="whitespace-pre px-3 py-0">{line || " "}</span>
            </div>
          ))}
        </code>
      </pre>
    </section>
  );
}
