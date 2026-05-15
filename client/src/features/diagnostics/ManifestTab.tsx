import { useEffect, useState } from "react";
import {
  manifestApi,
  type ManifestLoadResult,
  type ManifestValidationIssue,
} from "../../lib/api";
import { formatLongDateTime } from "../../lib/date";

import { PixelSkeleton } from "../../components/PixelSkeleton";

// Diagnostics → Manifest tab. Surfaces the v0.2.6 Phase 3 manifest
// emitted by godot-lib at the active project's Godot root.
//
// Four states the API can return:
//   - "ok"             → green badge, schema version, counts, per-domain table
//   - "missing"        → "no manifest detected" with godot-lib install pointer
//   - "error"          → red badge, error message + per-issue list
//   - "not-applicable" → muted "this isn't a sync-mode project" message
//
// The manifest contributes to the diagnostics severity ONLY on "error"
// (warning level) — "missing" is the normal case for FoB-shaped projects
// that haven't installed godot-lib yet, and "not-applicable" is normal
// for notebook mode.

export function ManifestTab() {
  const [result, setResult] = useState<ManifestLoadResult | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    manifestApi
      .get()
      .then(setResult)
      .catch((e) => setError(String(e)));
  };

  useEffect(refresh, []);

  if (result === undefined && error === null) return <PixelSkeleton />;
  if (error)
    return <p className="text-red-400">Failed to fetch: {error}</p>;
  if (!result)
    return <p className="text-neutral-400">No manifest info available.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        The Bleepforge manifest emitted by{" "}
        <code className="text-neutral-300">godot-lib</code> at your project root.
        Drives generic editor surfaces in v0.2.7+. Re-export from your Godot
        editor's <code className="text-neutral-300">Tools → Re-export Bleepforge manifest</code>{" "}
        menu, then refresh below.
      </p>

      <StatusBanner result={result} />

      {result.status === "ok" && result.manifest ? (
        <OkBody result={result} />
      ) : null}

      {result.status === "error" ? <ErrorBody result={result} /> : null}

      {result.status === "missing" ? <MissingBody result={result} /> : null}

      {result.status === "not-applicable" ? (
        <NotApplicableBody result={result} />
      ) : null}

      <div className="pt-1">
        <button
          type="button"
          onClick={refresh}
          className="border-2 border-neutral-800 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function StatusBanner({ result }: { result: ManifestLoadResult }) {
  const tone =
    result.status === "ok"
      ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-200"
      : result.status === "error"
        ? "border-red-700/60 bg-red-950/30 text-red-200"
        : result.status === "missing"
          ? "border-amber-700/60 bg-amber-950/20 text-amber-200"
          : "border-neutral-800 bg-neutral-900/50 text-neutral-400";

  const label =
    result.status === "ok"
      ? "OK"
      : result.status === "error"
        ? "ERROR"
        : result.status === "missing"
          ? "NOT DETECTED"
          : "NOT APPLICABLE";

  return (
    <div className={`border-2 ${tone} px-3 py-2`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider">
          {label}
        </span>
        {result.resPath ? (
          <code className="text-[10px] text-neutral-400">{result.resPath}</code>
        ) : null}
      </div>
    </div>
  );
}

function OkBody({ result }: { result: ManifestLoadResult }) {
  const m = result.manifest!;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
        <Row label="Schema version" value={String(m.schemaVersion)} mono />
        <Row label="Domains" value={String(m.domains.length)} mono />
        <Row label="Sub-resources" value={String(m.subResources.length)} mono />
        {result.mtime ? (
          <Row label="Last modified" value={formatLongDateTime(result.mtime)} />
        ) : null}
        {result.sizeBytes !== undefined ? (
          <Row label="Size" value={`${result.sizeBytes} bytes`} mono />
        ) : null}
        {result.filePath ? (
          <Row label="File" value={result.filePath} mono />
        ) : null}
      </dl>

      {m.domains.length > 0 ? (
        <div>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            Domains
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-neutral-800 text-left text-neutral-500">
                  <th className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider">
                    Domain
                  </th>
                  <th className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider">
                    Kind
                  </th>
                  <th className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider">
                    Class
                  </th>
                  <th className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider">
                    Key
                  </th>
                  <th className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider">
                    Fields
                  </th>
                  <th className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider">
                    View
                  </th>
                  <th className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider">
                    Override
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.domains.map((d) => (
                  <tr
                    key={d.domain}
                    className="border-b border-neutral-900 text-neutral-200"
                  >
                    <td className="px-2 py-1.5 font-mono">{d.domain}</td>
                    <td className="px-2 py-1.5 font-mono text-neutral-400">
                      {d.kind}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {"class" in d ? d.class : (d as { base: { class: string } }).base?.class ?? ""}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-neutral-400">
                      {"key" in d ? d.key : ""}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-neutral-400">
                      {countDomainFields(d)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-neutral-400">
                      {d.view ?? "list"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-neutral-400">
                      {d.overrideUi ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {m.subResources.length > 0 ? (
        <div>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            Sub-resources
          </h3>
          <ul className="space-y-1 text-xs">
            {m.subResources.map((s) => (
              <li
                key={s.subResource}
                className="flex items-center gap-3 font-mono"
              >
                <span className="text-neutral-200">{s.subResource}</span>
                <span className="text-neutral-500">
                  ({Object.keys(s.fields).length} fields)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ErrorBody({ result }: { result: ManifestLoadResult }) {
  return (
    <div className="space-y-3">
      <div className="border-2 border-red-700/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">
        {result.error}
      </div>
      {result.filePath ? (
        <p className="font-mono text-[10px] text-neutral-500">
          File: {result.filePath}
        </p>
      ) : null}
      {result.issues && result.issues.length > 0 ? (
        <div>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            Validation issues
          </h3>
          <ul className="space-y-1 text-xs">
            {result.issues.map((iss, idx) => (
              <IssueRow key={idx} issue={iss} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function IssueRow({ issue }: { issue: ManifestValidationIssue }) {
  return (
    <li className="border-l-2 border-red-700/60 pl-3">
      <code className="block text-[10px] text-neutral-400">{issue.path}</code>
      <span className="text-neutral-200">{issue.message}</span>
    </li>
  );
}

function MissingBody({ result }: { result: ManifestLoadResult }) {
  return (
    <div className="space-y-3 text-sm text-neutral-400">
      <p>
        No <code className="text-neutral-200">bleepforge_manifest.json</code>{" "}
        at your project root yet. The manifest is emitted by the{" "}
        <code className="text-neutral-200">godot-lib</code> companion plugin
        when you enable it in your Godot editor.
      </p>
      {result.filePath ? (
        <p className="font-mono text-[10px] text-neutral-500">
          Expected at: {result.filePath}
        </p>
      ) : null}
      <p>
        This is normal for projects that don't use the Bleepforge library
        yet. Existing editor surfaces work without it.
      </p>
      <p className="text-xs text-neutral-500">
        To install: copy{" "}
        <code className="text-neutral-300">godot-lib/addons/bleepforge/</code>{" "}
        into your Godot project's <code className="text-neutral-300">addons/</code>{" "}
        folder, then enable it via{" "}
        <code className="text-neutral-300">
          Project → Project Settings → Plugins
        </code>
        .
      </p>
    </div>
  );
}

function NotApplicableBody({ result }: { result: ManifestLoadResult }) {
  return (
    <div className="space-y-3 text-sm text-neutral-400">
      <p>{result.reason ?? "Manifest not applicable for this project."}</p>
      <p className="text-xs text-neutral-500">
        The manifest only applies to sync-mode projects with a Godot project
        root. Notebook-mode projects own their content directly inside
        Bleepforge and don't need a manifest.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="font-mono uppercase tracking-wider text-neutral-500">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-neutral-200" : "text-neutral-200"}>
        {value}
      </dd>
    </>
  );
}

function countDomainFields(domain: {
  fields?: Record<string, unknown>;
  base?: { fields?: Record<string, unknown> };
}): string {
  if (domain.fields) return String(Object.keys(domain.fields).length);
  if (domain.base?.fields) {
    return `${Object.keys(domain.base.fields).length} (base)`;
  }
  return "0";
}
