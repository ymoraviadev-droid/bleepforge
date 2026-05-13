import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { Button, ButtonLink } from "../../components/Button";
import { ExternalChangeBanner } from "../../components/ExternalChangeBanner";
import { showConfirm, showPrompt } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { pushToast } from "../../components/Toast";
import type { ShaderAsset, ShaderUsage } from "../../lib/api";
import { shadersApi } from "../../lib/api";
import { useShaderRefresh } from "../../lib/shaders/useShaderRefresh";
import { useUnsavedWarning } from "../../lib/useUnsavedWarning";
import type { ShaderCardColor, ShaderPattern } from "@bleepforge/shared";

import { DirtyDot } from "../../components/DirtyDot";
import { CodeEditor } from "./CodeEditor";
import { ColorPicker } from "./ColorPicker";
import {
  fmtBytes,
  shaderCardStyle,
  shaderPreviewTint,
  shaderTypeLabel,
} from "./format";
import { PatternPicker } from "./PatternPicker";
import { PreviewPane } from "./PreviewPane";
import { ShaderUsagesPanel } from "./UsagesPanel";
import { emitGlsl, parseGdshader } from "./translator";
import type { CompileError, CompileResult, EmitResult, UniformDecl } from "./translator";
import type { ShaderDiagnostic } from "./diagnostics";

import { PixelSkeleton } from "../../components/PixelSkeleton";
// Shader edit page. Phases 2 + 3 ship full authoring + live preview:
// CodeMirror editor with GDShader syntax highlighting, dirty indicator,
// save (button + Ctrl+S), delete, duplicate, external-edit banner —
// PLUS a WebGL2 preview canvas that re-translates GDShader → GLSL ES on
// every edit, with auto-generated uniform controls.
//
// Path comes via ?path= so the URL stays valid for any shader regardless
// of folder depth.

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export function ShaderEdit() {
  const [searchParams] = useSearchParams();
  const path = searchParams.get("path") ?? "";
  const navigate = useNavigate();

  const [asset, setAsset] = useState<ShaderAsset | null>(null);
  /** Source as last seen on disk — the baseline against which dirtiness
   *  is computed. Updates on initial load + after every successful save +
   *  on accepted external-edit reload. */
  const [saved, setSaved] = useState<string>("");
  /** Source currently in the editor — diverges from `saved` while the
   *  user types. */
  const [editing, setEditing] = useState<string>("");
  const [usages, setUsages] = useState<ShaderUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usagesError, setUsagesError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  /** Set when an external SSE event hits this path while we have
   *  unsaved local edits — banner prompts the user to keep or discard. */
  const [externalChange, setExternalChange] = useState<
    null | { kind: "changed" | "removed" }
  >(null);
  // Active tab — Code or Live preview. Persisted to localStorage so
  // the choice survives a reload. Default "code" on first visit.
  const [activeTab, setActiveTabState] = useState<TabId>(() => readSavedTab());
  const setActiveTab = (id: TabId) => {
    setActiveTabState(id);
    try {
      window.localStorage.setItem(TAB_KEY, id);
    } catch {}
  };

  const dirty = saved !== editing;

  useUnsavedWarning(dirty);

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
        setSaved(r.source);
        setEditing(r.source);
      })
      .catch((e) => {
        const msg = String(e);
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

  const reloadFromDisk = useCallback(() => {
    if (!path) return;
    shadersApi
      .getFile(path)
      .then((r) => {
        if (!r.asset) {
          setNotFound(true);
          return;
        }
        setAsset(r.asset);
        setSaved(r.source);
        setEditing(r.source);
        setExternalChange(null);
      })
      .catch((e) => setError(String(e)));
  }, [path]);

  // External-edit handling. Three cases for an event on THIS path:
  //   - removed: file is gone. Surface a banner; user can navigate away
  //     or wait for it to come back (e.g. rename in flight).
  //   - changed/added on a CLEAN local copy: silently refetch — no
  //     conflict possible.
  //   - changed/added with LOCAL DIRTY: show banner so the user can
  //     keep their edits OR discard + reload.
  useShaderRefresh((event) => {
    if (!asset || event.path !== asset.path) return;
    if (event.kind === "removed") {
      setExternalChange({ kind: "removed" });
      return;
    }
    if (dirty) {
      setExternalChange({ kind: "changed" });
      return;
    }
    reloadFromDisk();
  });

  const handleSave = useCallback(async () => {
    if (!path || !dirty || saveState.kind === "saving") return;
    setSaveState({ kind: "saving" });
    try {
      const r = await shadersApi.save(path, editing);
      if (r.asset) setAsset(r.asset);
      setSaved(editing);
      setSaveState({ kind: "saved", at: Date.now() });
      // Clear external-change banner — a successful save resolves the
      // conflict in favor of local edits, which is what the user asked
      // for by pressing Save.
      setExternalChange(null);
    } catch (e) {
      setSaveState({ kind: "error", message: String(e) });
      pushToast({
        id: `shader-save-error:${path}`,
        variant: "error",
        title: "Save failed",
        body: String(e),
      });
    }
  }, [path, dirty, editing, saveState.kind]);

  // Auto-clear the "Saved ✓" indicator after 2s so it doesn't sit there
  // forever and obscure that the buffer is now clean.
  useEffect(() => {
    if (saveState.kind !== "saved") return;
    const timer = setTimeout(() => setSaveState({ kind: "idle" }), 2000);
    return () => clearTimeout(timer);
  }, [saveState]);

  // Card pattern picker — saves immediately on selection. Independent
  // of the source-text save flow; updating the pattern doesn't touch
  // the .gdshader file (Bleepforge-only metadata lives in
  // data/shaders/_meta.json).
  const handlePatternChange = useCallback(
    async (next: ShaderPattern) => {
      if (!path) return;
      try {
        const r = await shadersApi.setPattern(path, next);
        if (r.asset) setAsset(r.asset);
      } catch (e) {
        pushToast({
          id: `shader-pattern-error:${path}`,
          variant: "error",
          title: "Pattern save failed",
          body: String(e),
        });
      }
    },
    [path],
  );

  // Card color override — same save-on-pick model as the pattern picker.
  // Passing null clears the override (card falls back to shader_type
  // tint); the API handles both.
  const handleColorChange = useCallback(
    async (next: ShaderCardColor | null) => {
      if (!path) return;
      try {
        const r = await shadersApi.setColor(path, next);
        if (r.asset) setAsset(r.asset);
      } catch (e) {
        pushToast({
          id: `shader-color-error:${path}`,
          variant: "error",
          title: "Color save failed",
          body: String(e),
        });
      }
    },
    [path],
  );

  const handleDelete = useCallback(async () => {
    if (!path || !asset) return;
    const ok = await showConfirm({
      title: "Delete shader?",
      message: `This will remove ${asset.basename} from disk along with its .gdshader.uid sidecar. Any .tres / .tscn references will dangle until you point them somewhere else.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    try {
      await shadersApi.deleteFile(path);
      pushToast({
        id: `shader-deleted:${path}`,
        variant: "info",
        title: "Shader deleted",
        body: asset.basename,
      });
      navigate("/shaders");
    } catch (e) {
      pushToast({
        id: `shader-delete-error:${path}`,
        variant: "error",
        title: "Delete failed",
        body: String(e),
      });
    }
  }, [path, asset, navigate]);

  const handleDuplicate = useCallback(async () => {
    if (!asset) return;
    const stem = asset.basename.replace(/\.gdshader$/, "");
    const proposed = `${stem}-copy`;
    const newName = await showPrompt({
      title: "Duplicate shader",
      message: `Save a copy in the same folder. The .gdshader extension will be appended if you leave it off.`,
      placeholder: proposed,
      defaultValue: proposed,
      confirmLabel: "Duplicate",
      cancelLabel: "Cancel",
      validate: (v) => {
        const t = v.trim();
        if (!t) return "Name is required";
        if (t.includes("/") || t.includes("\\")) return "No slashes";
        if (t.startsWith(".")) return "No leading dots";
        return null;
      },
    });
    if (!newName) return;
    try {
      // Server emits the template by default — to copy the current source
      // we POST /new (which creates with template), then PUT /file (which
      // overwrites with our actual source). Two round-trips, but the
      // server stays simpler (one entry point per concern) and the
      // duplication is rare enough that the extra ms doesn't matter.
      const created = await shadersApi.create({
        targetDir: asset.parentDir,
        filename: newName,
        shaderType: asset.shaderType ?? "canvas_item",
      });
      // Push our current editor contents (not the on-disk `saved`) so
      // duplicate captures the user's in-progress work too — matches
      // intuition: "what's on screen is what I want copied".
      await shadersApi.save(created.path, editing);
      pushToast({
        id: `shader-duplicated:${created.path}`,
        variant: "success",
        title: "Shader duplicated",
        body: created.asset?.basename ?? newName,
      });
      navigate(`/shaders/edit?path=${encodeURIComponent(created.path)}`);
    } catch (e) {
      pushToast({
        id: `shader-duplicate-error:${asset.path}`,
        variant: "error",
        title: "Duplicate failed",
        body: String(e),
      });
    }
  }, [asset, editing, navigate]);

  const lineCount = useMemo(
    () => (editing ? editing.split("\n").length : 0),
    [editing],
  );

  // Translate GDShader → GLSL ES whenever the editor content changes,
  // debounced so a burst of keystrokes doesn't trigger N WebGL
  // recompiles. 150ms is fast enough that the preview feels live but
  // slow enough that scrolling-through-text-fixes batches naturally.
  const [emit, setEmit] = useState<EmitResult | null>(null);
  const [uniforms, setUniforms] = useState<UniformDecl[]>([]);
  const [parseError, setParseError] = useState<{
    reason: string;
    line: number | null;
  } | null>(null);
  /** Latest WebGL compile errors from PreviewPane. Lifted here so the
   *  same data drives both the preview's red banner AND the CodeMirror
   *  gutter markers below. */
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const result = parseGdshader(editing);
      if (!result.ok) {
        setParseError({ reason: result.reason, line: result.line });
        setEmit(null);
        // Leave uniforms in their last-good state — keeps the live
        // controls visible while the user is mid-typo. They get
        // re-derived when the parse next succeeds.
        return;
      }
      setParseError(null);
      setUniforms(result.uniforms);
      setEmit(emitGlsl(result));
    }, 150);
    return () => clearTimeout(timer);
  }, [editing]);

  const handleCompileResult = useCallback((result: CompileResult) => {
    setCompileErrors(result.ok ? [] : result.errors);
  }, []);

  // Aggregate parser + WebGL diagnostics for the editor's gutter. Both
  // surfaces already use 1-indexed user-source lines, so the mapping
  // is direct. Compile errors that couldn't be line-mapped (userLine
  // null — typically prelude-level issues we'd never expect a user to
  // see) get omitted from the gutter; they still appear in the banner.
  const diagnostics = useMemo<ShaderDiagnostic[]>(() => {
    const out: ShaderDiagnostic[] = [];
    if (parseError && parseError.line !== null) {
      out.push({
        line: parseError.line,
        severity: "error",
        message: parseError.reason,
        source: "translator",
      });
    }
    for (const err of compileErrors) {
      if (err.userLine === null) continue;
      out.push({
        line: err.userLine,
        severity: "error",
        message: err.message,
        source: "webgl",
      });
    }
    return out;
  }, [parseError, compileErrors]);

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (!asset) return <PixelSkeleton />;

  const style = shaderCardStyle(asset);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1
            className="flex items-center gap-2 truncate font-mono text-lg text-neutral-100"
            title={asset.basename}
          >
            {asset.basename}
            <DirtyDot dirty={dirty} />
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
        <div className="flex flex-wrap items-center gap-2">
          <SaveStatusIndicator state={saveState} dirty={dirty} />
          <Button
            onClick={handleSave}
            disabled={!dirty || saveState.kind === "saving"}
            variant="primary"
            size="sm"
            title="Save (Ctrl+S)"
          >
            {saveState.kind === "saving" ? "Saving…" : "Save"}
          </Button>
          <Button onClick={handleDuplicate} variant="secondary" size="sm">
            Duplicate
          </Button>
          <Button
            onClick={handleDelete}
            variant="danger"
            size="sm"
            title="Delete this shader from disk"
          >
            Delete
          </Button>
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

      {externalChange && (
        <ExternalChangeBanner
          kind={externalChange.kind}
          onReload={reloadFromDisk}
          onDismiss={() => setExternalChange(null)}
          message={
            externalChange.kind === "removed"
              ? "This shader was deleted on disk. Your editor still has the last-known source; you can save to recreate it, or navigate away."
              : undefined
          }
        />
      )}

      <TabStrip
        active={activeTab}
        onChange={setActiveTab}
        codeDirty={dirty}
        previewHasErrors={compileErrors.length > 0 || parseError !== null}
      />

      {/* Both tabs stay mounted via `hidden` so the WebGL context, editor
          scroll position, uniform values, and time-control state survive
          tab switches. Unmounting would tear down the GL context (lose
          textures + recompile lag on every flip) and reset every slider. */}
      <div hidden={activeTab !== "code"} className="space-y-4">
        <section className="overflow-hidden border-2 border-neutral-800 bg-neutral-950">
          <header className="flex items-center justify-between border-b-2 border-neutral-800 px-3 py-2">
            <h2 className="font-display text-xs uppercase tracking-wider text-neutral-300">
              Source
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
              Ctrl+S to save
            </span>
          </header>
          <div className="min-h-[60vh]">
            <CodeEditor
              value={editing}
              onChange={setEditing}
              onSave={handleSave}
              readOnly={externalChange?.kind === "removed"}
              diagnostics={diagnostics}
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <ShaderUsagesPanel usages={usages} error={usagesError} />
          <section className="border-2 border-neutral-800 bg-neutral-950">
            <header className="border-b-2 border-neutral-800 px-3 py-2">
              <h2 className="font-display text-xs uppercase tracking-wider text-neutral-300">
                Card style
              </h2>
            </header>
            <div className="space-y-3 p-3">
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                  Pattern
                </div>
                <PatternPicker
                  value={asset.pattern}
                  onChange={handlePatternChange}
                  color={shaderPreviewTint(asset.color, asset.shaderType)}
                />
              </div>
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                  Color
                </div>
                <ColorPicker
                  value={asset.color}
                  onChange={handleColorChange}
                  shaderType={asset.shaderType}
                />
              </div>
              <p className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
                Bleepforge-only visual identity. Not saved to the .gdshader.
              </p>
            </div>
          </section>
        </div>
      </div>

      <div hidden={activeTab !== "preview"}>
        <PreviewPane
          emit={emit}
          uniforms={uniforms}
          parseError={parseError}
          compileErrors={compileErrors}
          onCompileResult={handleCompileResult}
        />
      </div>
    </div>
  );
}

// Persisted across sessions so the user lands on the same tab they
// left from. Per-app (not per-shader) — the user's working mode is
// "I'm editing code" or "I'm tuning preview", not a per-file choice.
const TAB_KEY = "bleepforge:shaderEditTab";
type TabId = "code" | "preview";

function readSavedTab(): TabId {
  if (typeof window === "undefined") return "code";
  try {
    const raw = window.localStorage.getItem(TAB_KEY);
    if (raw === "code" || raw === "preview") return raw;
  } catch {}
  return "code";
}

function TabStrip({
  active,
  onChange,
  codeDirty,
  previewHasErrors,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  codeDirty: boolean;
  previewHasErrors: boolean;
}) {
  return (
    <div role="tablist" className="flex gap-0 border-b-2 border-neutral-800">
      <TabButton
        id="code"
        label="Code"
        active={active === "code"}
        onClick={() => onChange("code")}
        badgeColor={codeDirty ? "amber" : null}
        badgeTitle={codeDirty ? "Unsaved changes" : undefined}
      />
      <TabButton
        id="preview"
        label="Live preview"
        active={active === "preview"}
        onClick={() => onChange("preview")}
        badgeColor={previewHasErrors ? "red" : null}
        badgeTitle={previewHasErrors ? "Compile errors" : undefined}
      />
    </div>
  );
}

function TabButton({
  id,
  label,
  active,
  onClick,
  badgeColor,
  badgeTitle,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
  badgeColor: "amber" | "red" | null;
  badgeTitle?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      // Active tab gets a 2px emerald bottom edge that sits flush with
      // the parent's border-b-2 (effectively replacing it in the active
      // column), plus emerald text. Inactive stays neutral with a 2px
      // transparent bottom so label position doesn't shift on switch.
      className={`relative -mb-0.5 flex items-center gap-2 border-b-2 px-4 py-2 font-display text-xs uppercase tracking-wider transition-colors ${
        active
          ? "border-emerald-500 text-emerald-300"
          : "border-transparent text-neutral-500 hover:text-neutral-300"
      }`}
      data-tab={id}
    >
      <span>{label}</span>
      {badgeColor && (
        <span
          className={`inline-block size-2 ${
            badgeColor === "amber" ? "bg-amber-400" : "bg-red-500"
          }`}
          title={badgeTitle}
          aria-label={badgeTitle}
        />
      )}
    </button>
  );
}

function SaveStatusIndicator({
  state,
  dirty,
}: {
  state: SaveState;
  dirty: boolean;
}) {
  if (state.kind === "saved") {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-wider text-emerald-400"
        title="Saved to disk"
      >
        Saved ✓
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-wider text-red-400"
        title={state.message}
      >
        Save failed
      </span>
    );
  }
  if (state.kind === "saving") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400/80">
        Unsaved
      </span>
    );
  }
  return null;
}

