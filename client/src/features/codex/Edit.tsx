import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  defaultPropertiesForMeta,
  type CodexCategoryMeta,
  type CodexEntry,
  type CodexPropertyDef,
} from "@bleepforge/shared";
import { codexApi } from "../../lib/api";
import { AssetPicker } from "../../components/AssetPicker";
import { Button, ButtonLink } from "../../components/Button";
import { DL } from "../../components/CatalogDatalists";
import { showConfirm } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { useCatalog } from "../../lib/useCatalog";
import { fieldLabel, textInput } from "../../styles/classes";
import { TagInput } from "./TagInput";
import { validateCodexEntry } from "./propertyValidator";

import { PixelSkeleton } from "../../components/PixelSkeleton";
const NAME_RE = /^[a-zA-Z0-9_-]+$/;

const empty = (): CodexEntry => ({
  Id: "",
  DisplayName: "",
  Image: "",
  Description: "",
  Path: "",
  Properties: {},
});

// Dynamic edit form for a single Codex entry. Three default fields (Image,
// Description, Path) are always present; the rest of the form is built
// from the category's _meta.json properties at render time. Each
// property type maps to a small dedicated control. Inline validation
// errors come from validateCodexEntry which layers FK ref existence on
// top of the shared structural check.

export function Edit() {
  const { category: routeCategory, id } = useParams();
  const navigate = useNavigate();
  const isNew = id === undefined;
  const catalog = useCatalog();

  const [meta, setMeta] = useState<CodexCategoryMeta | null>(null);
  const [entry, setEntry] = useState<CodexEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load meta first, then the entry. Meta is required to render the
  // dynamic property fields and to compute defaults for new entries.
  useEffect(() => {
    if (!routeCategory) return;
    codexApi
      .getMeta(routeCategory)
      .then((m) => {
        if (m === null) {
          setError("not found");
          return;
        }
        setMeta(m);
        if (isNew) {
          setEntry({ ...empty(), Properties: defaultPropertiesForMeta(m) });
        }
      })
      .catch((e) => setError(String(e)));
  }, [routeCategory, isNew]);

  useEffect(() => {
    if (isNew || !routeCategory || !id) return;
    codexApi
      .getEntry(routeCategory, id)
      .then((e) => (e === null ? setError("not found") : setEntry(e)))
      .catch((e) => setError(String(e)));
  }, [routeCategory, id, isNew]);

  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (!meta || !entry || !routeCategory)
    return <PixelSkeleton />;

  const update = (partial: Partial<CodexEntry>) => setEntry({ ...entry, ...partial });
  const updateProp = (key: string, value: unknown) =>
    setEntry({ ...entry, Properties: { ...entry.Properties, [key]: value } });

  const validation = validateCodexEntry(meta, entry, catalog);
  const errorByKey = new Map<string, string>();
  for (const v of validation) errorByKey.set(v.property, v.message);

  const canSave =
    NAME_RE.test(entry.Id) && entry.Id !== "_meta" && validation.length === 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await codexApi.saveEntry(routeCategory, entry);
      if (isNew) {
        navigate(
          `/codex/${encodeURIComponent(routeCategory)}/${encodeURIComponent(saved.Id)}`,
          { replace: true },
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew || !id) return;
    const ok = await showConfirm({
      title: `Delete entry "${entry.DisplayName || entry.Id}"?`,
      message: "This removes the JSON file from disk. Cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await codexApi.removeEntry(routeCategory, id);
    navigate(`/codex?category=${encodeURIComponent(routeCategory)}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          <Link
            to={`/codex?category=${encodeURIComponent(routeCategory)}`}
            className="text-neutral-400 hover:text-neutral-200"
          >
            {meta.DisplayName || routeCategory}
          </Link>
          <span className="mx-2 text-neutral-600">/</span>
          {isNew ? "New entry" : entry.DisplayName || entry.Id}
        </h1>
        <div className="flex gap-2">
          <ButtonLink
            to={`/codex?category=${encodeURIComponent(routeCategory)}`}
            variant="secondary"
          >
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
            <span className={fieldLabel}>Id</span>
            <input
              value={entry.Id}
              onChange={(e) => update({ Id: e.target.value })}
              disabled={!isNew}
              placeholder="e.g. lava"
              className={`${textInput} font-mono disabled:cursor-not-allowed disabled:opacity-60`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Filename basename. Locked once saved.
            </span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Display name</span>
            <input
              value={entry.DisplayName}
              onChange={(e) => update({ DisplayName: e.target.value })}
              placeholder="e.g. Lava pool"
              className={textInput}
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
          Defaults
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className={fieldLabel}>Image</span>
            <AssetPicker
              path={entry.Image}
              onChange={(Image) => update({ Image })}
              placeholder="absolute path to image"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={fieldLabel}>Path</span>
            <input
              value={entry.Path}
              onChange={(e) => update({ Path: e.target.value })}
              placeholder="e.g. scripts/hazards/lava.gd"
              className={`${textInput} font-mono`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Free-form documentary string. Where to find this in the project,
              for your own reference.
            </span>
          </label>
        </div>
        <label className="block">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={entry.Description}
            onChange={(e) => update({ Description: e.target.value })}
            rows={4}
            placeholder="What is this thing? How does it behave?"
            className={textInput}
          />
        </label>
      </section>

      {meta.Properties.length > 0 && (
        <section className="space-y-3 rounded border border-neutral-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
            {meta.DisplayName || meta.Category} properties
          </h2>
          {meta.Properties.map((def) => (
            <PropertyField
              key={def.Key}
              def={def}
              value={entry.Properties[def.Key]}
              onChange={(v) => updateProp(def.Key, v)}
              error={errorByKey.get(def.Key)}
            />
          ))}
        </section>
      )}

      {validation.length > 0 && (
        <ul className="space-y-1 border border-red-800/60 bg-red-950/30 p-3 text-xs text-red-300">
          {validation.map((v, i) => (
            <li key={i}>• {v.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PropertyFieldProps {
  def: CodexPropertyDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error: string | undefined;
}

function PropertyField({ def, value, onChange, error }: PropertyFieldProps) {
  const label = def.Label || def.Key;
  const requiredMark = def.Required ? (
    <span className="ml-1 text-red-400" title="required">
      *
    </span>
  ) : null;

  return (
    <label className="block">
      <span className={fieldLabel}>
        {label}
        {requiredMark}
        <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-neutral-600">
          {def.Type}
          {def.Type === "ref" && def.RefDomain ? `: ${def.RefDomain}` : ""}
        </span>
      </span>
      <PropertyControl def={def} value={value} onChange={onChange} />
      {error && (
        <span className="mt-1 block text-[10px] text-red-400">{error}</span>
      )}
    </label>
  );
}

interface PropertyControlProps {
  def: CodexPropertyDef;
  value: unknown;
  onChange: (v: unknown) => void;
}

function PropertyControl({ def, value, onChange }: PropertyControlProps) {
  switch (def.Type) {
    case "text":
      return (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={textInput}
        />
      );
    case "multiline":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={textInput}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? undefined : Number(v));
          }}
          className={`${textInput} font-mono`}
        />
      );
    case "boolean":
      return (
        <div className="mt-1 flex h-9 items-center">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4"
          />
        </div>
      );
    case "image":
      return (
        <AssetPicker
          path={typeof value === "string" ? value : ""}
          onChange={(p) => onChange(p)}
          placeholder="absolute path to image"
        />
      );
    case "ref":
      return (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          list={def.RefDomain ? listIdFor(def.RefDomain) : undefined}
          placeholder={def.RefDomain ? `pick a ${def.RefDomain}` : "(no ref domain)"}
          className={`${textInput} font-mono`}
        />
      );
    case "tags":
      return (
        <TagInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(next) => onChange(next)}
          placeholder="type a tag, then Enter or comma…"
        />
      );
    default:
      return null;
  }
}

function listIdFor(refDomain: string): string | undefined {
  switch (refDomain) {
    case "npc":
      return DL.npcIds;
    case "item":
      return DL.itemSlugs;
    case "quest":
      return DL.questIds;
    case "faction":
      return DL.factions;
    case "dialog":
      return DL.sequenceIds;
    case "balloon":
      return DL.balloonIds;
    default:
      return undefined;
  }
}
