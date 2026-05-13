import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  CODEX_COLORS,
  CODEX_PROPERTY_TYPES,
  CODEX_REF_DOMAINS,
  type CodexCategoryMeta,
  type CodexColor,
  type CodexPropertyDef,
  type CodexPropertyType,
  type CodexRefDomain,
} from "@bleepforge/shared";
import { codexApi } from "../../lib/api";
import { Button, ButtonLink } from "../../components/Button";
import { DirtyDot } from "../../components/DirtyDot";
import { showConfirm } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { useUnsavedWarning } from "../../lib/useUnsavedWarning";
import { button, fieldLabel, textInput } from "../../styles/classes";
import { categoryColorClasses } from "./categoryColor";

import { PixelSkeleton } from "../../components/PixelSkeleton";
const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// Edit / create a Codex category — its display name, color, and property
// schema. Property reorder is up/down arrows (drag-and-drop is overkill
// for a list this small; arrows are also keyboard-accessible). Add row
// appends a stub property; user fills in Key/Label/Type after.
//
// Saving validates that every property has a non-empty Key matching
// /^[a-zA-Z][a-zA-Z0-9_]*$/. Type-vs-RefDomain coherence (a "ref"
// property must declare a RefDomain) is also checked here so the entry
// form doesn't have to render half-broken controls.

const empty = (): CodexCategoryMeta => ({
  Category: "",
  DisplayName: "",
  Color: "emerald",
  Properties: [],
  CreatedAt: "",
});

const emptyProp = (): CodexPropertyDef => ({
  Key: "",
  Label: "",
  Type: "text",
  Required: false,
});

export function CategoryEdit() {
  const { category: routeCategory } = useParams();
  const navigate = useNavigate();
  const isNew = routeCategory === undefined;

  const [meta, setMeta] = useState<CodexCategoryMeta | null>(isNew ? empty() : null);
  /** Baseline snapshot for the dirty check. For new categories the
   *  empty stub is the baseline — once the user types anything, dirty
   *  flips on. For existing categories, baseline gets the loaded meta
   *  and re-syncs after every successful save. */
  const [baseline, setBaseline] = useState<CodexCategoryMeta | null>(
    isNew ? empty() : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !routeCategory) return;
    codexApi
      .getMeta(routeCategory)
      .then((m) => {
        if (m === null) {
          setError("not found");
        } else {
          setMeta(m);
          setBaseline(m);
        }
      })
      .catch((e) => setError(String(e)));
  }, [routeCategory, isNew]);

  const dirty = useMemo(() => {
    if (meta === null || baseline === null) return false;
    return JSON.stringify(meta) !== JSON.stringify(baseline);
  }, [meta, baseline]);

  useUnsavedWarning(dirty);

  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (meta === null) return <PixelSkeleton />;

  const update = (partial: Partial<CodexCategoryMeta>) =>
    setMeta({ ...meta, ...partial });

  const updateProp = (index: number, partial: Partial<CodexPropertyDef>) => {
    const next = [...meta.Properties];
    next[index] = { ...next[index]!, ...partial };
    setMeta({ ...meta, Properties: next });
  };

  const addProp = () => {
    setMeta({ ...meta, Properties: [...meta.Properties, emptyProp()] });
  };

  const removeProp = (index: number) => {
    setMeta({
      ...meta,
      Properties: meta.Properties.filter((_, i) => i !== index),
    });
  };

  const moveProp = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= meta.Properties.length) return;
    const next = [...meta.Properties];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setMeta({ ...meta, Properties: next });
  };

  // Validation precedes the Save button enable check so users see why
  // it's disabled even before they hit it.
  const validationErrors: string[] = [];
  if (!meta.Category) validationErrors.push("Category name is required");
  else if (!NAME_RE.test(meta.Category))
    validationErrors.push(
      "Category name must contain only letters, numbers, _ and -",
    );
  meta.Properties.forEach((p, i) => {
    const which = `property #${i + 1}`;
    if (!p.Key) validationErrors.push(`${which}: key is required`);
    else if (!KEY_RE.test(p.Key))
      validationErrors.push(`${which}: key must match [a-zA-Z][a-zA-Z0-9_]*`);
    if (p.Type === "ref" && !p.RefDomain)
      validationErrors.push(`${which}: ref domain is required for ref type`);
  });
  // Duplicate keys
  const keys = meta.Properties.map((p) => p.Key).filter(Boolean);
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  for (const k of new Set(dupKeys)) {
    validationErrors.push(`duplicate property key: "${k}"`);
  }

  const canSave = validationErrors.length === 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await codexApi.saveMeta(meta);
      // Update baseline BEFORE the navigate so the useUnsavedWarning
      // blocker sees clean state and lets the route change through.
      setBaseline(saved);
      if (isNew) {
        navigate(`/codex/${encodeURIComponent(saved.Category)}/_meta`, {
          replace: true,
        });
      } else {
        setMeta(saved);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew || !routeCategory) return;
    const ok = await showConfirm({
      title: `Delete category "${meta.DisplayName || routeCategory}"?`,
      message: `This removes the schema and ALL ${meta.Properties.length === 0 ? "" : ""}entries in this category from disk. This action cannot be undone.`,
      confirmLabel: "Delete category",
      danger: true,
    });
    if (!ok) return;
    await codexApi.removeCategory(routeCategory);
    navigate("/codex");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {isNew
            ? "New category"
            : `Category: ${meta.DisplayName || meta.Category}`}
          <DirtyDot dirty={dirty} />
        </h1>
        <div className="flex gap-2">
          <ButtonLink to="/codex" variant="secondary">
            ← Back
          </ButtonLink>
          {!isNew && (
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          )}
          <Button onClick={save} disabled={saving || !canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Category id</span>
            <input
              value={meta.Category}
              onChange={(e) => update({ Category: e.target.value })}
              disabled={!isNew}
              placeholder="e.g. hazards"
              className={`${textInput} font-mono disabled:cursor-not-allowed disabled:opacity-60`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Folder name on disk. Locked once saved — entries are stored at{" "}
              <span className="font-mono">data/codex/&lt;id&gt;/</span>.
            </span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Display name</span>
            <input
              value={meta.DisplayName}
              onChange={(e) => update({ DisplayName: e.target.value })}
              placeholder="e.g. Hazards"
              className={textInput}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Shown in the navbar group, list page, and search results.
            </span>
          </label>
        </div>
        <ColorPicker value={meta.Color} onChange={(c) => update({ Color: c })} />
      </section>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
            Properties
          </h2>
          <Button size="sm" variant="secondary" onClick={addProp}>
            + Add property
          </Button>
        </div>
        {meta.Properties.length === 0 ? (
          <p className="text-xs italic text-neutral-600">
            No custom properties yet. Every entry has Image, Description, and
            Path by default — add a property when entries need extra fields
            (e.g. damage, radius, elemental).
          </p>
        ) : (
          <ul className="space-y-3">
            {meta.Properties.map((p, i) => (
              <li
                key={i}
                className="grid grid-cols-12 items-start gap-2 border border-neutral-800 bg-neutral-950 p-2"
              >
                <label className="col-span-3 block">
                  <span className={fieldLabel}>Key</span>
                  <input
                    value={p.Key}
                    onChange={(e) => updateProp(i, { Key: e.target.value })}
                    placeholder="damage"
                    className={`${textInput} font-mono`}
                  />
                </label>
                <label className="col-span-3 block">
                  <span className={fieldLabel}>Label</span>
                  <input
                    value={p.Label}
                    onChange={(e) => updateProp(i, { Label: e.target.value })}
                    placeholder="Damage"
                    className={textInput}
                  />
                </label>
                <label className="col-span-2 block">
                  <span className={fieldLabel}>Type</span>
                  <select
                    value={p.Type}
                    onChange={(e) =>
                      updateProp(i, {
                        Type: e.target.value as CodexPropertyType,
                        // Clear RefDomain when switching off ref so the
                        // entry form doesn't render a stale picker.
                        RefDomain:
                          (e.target.value as CodexPropertyType) === "ref"
                            ? p.RefDomain
                            : undefined,
                      })
                    }
                    className={textInput}
                  >
                    {CODEX_PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                {p.Type === "ref" ? (
                  <label className="col-span-2 block">
                    <span className={fieldLabel}>Ref domain</span>
                    <select
                      value={p.RefDomain ?? ""}
                      onChange={(e) =>
                        updateProp(i, {
                          RefDomain: (e.target.value ||
                            undefined) as CodexRefDomain | undefined,
                        })
                      }
                      className={textInput}
                    >
                      <option value="">—</option>
                      {CODEX_REF_DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="col-span-2" />
                )}
                <label className="col-span-1 mt-5 flex items-center gap-1 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={p.Required}
                    onChange={(e) =>
                      updateProp(i, { Required: e.target.checked })
                    }
                  />
                  req.
                </label>
                <div className="col-span-1 mt-5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveProp(i, -1)}
                    disabled={i === 0}
                    className="px-1 text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveProp(i, 1)}
                    disabled={i === meta.Properties.length - 1}
                    className="px-1 text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeProp(i)}
                    className={`${button} bg-red-700 px-2 py-0.5 text-[10px] text-white hover:bg-red-600`}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {validationErrors.length > 0 && (
        <ul className="space-y-1 border border-red-800/60 bg-red-950/30 p-3 text-xs text-red-300">
          {validationErrors.map((err, i) => (
            <li key={i}>• {err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ColorPickerProps {
  value: CodexColor;
  onChange: (color: CodexColor) => void;
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div>
      <span className={fieldLabel}>Color</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {CODEX_COLORS.map((c) => {
          const cls = categoryColorClasses(c);
          const active = c === value;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={`size-7 border-2 ${cls.swatch} ${active ? "border-neutral-100" : "border-black/30"} transition-transform hover:scale-110`}
              title={c}
              aria-label={`Color ${c}`}
              aria-pressed={active}
            />
          );
        })}
      </div>
      <span className="mt-1 block text-[10px] text-neutral-600">
        Tints the category's section header on the list page, the card stripe,
        and the badge in app search.
      </span>
    </div>
  );
}
