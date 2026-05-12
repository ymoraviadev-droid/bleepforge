import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  HELP_COLORS,
  type HelpCategoryMeta,
  type HelpColor,
} from "@bleepforge/shared";
import { helpApi } from "../../lib/api";
import { useDevMode } from "../../lib/useDevMode";
import { Button, ButtonLink } from "../../components/Button";
import { showConfirm } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { fieldLabel, textInput } from "../../styles/classes";
import { paletteColorClasses } from "../../lib/paletteColor";
import { dispatchHelpChanged } from "./HelpLayout";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

const empty = (): HelpCategoryMeta => ({
  Category: "",
  DisplayName: "",
  Color: "emerald",
  Description: "",
  Order: 0,
  CreatedAt: "",
});

// Category schema editor. Bleepforge-only. Dev-mode-gated: when
// BLEEPFORGE_DEV_MODE is unset, this page renders the 404 fallback even
// though the route exists, since the server would reject any save.

export function CategoryEdit() {
  const { category } = useParams();
  const navigate = useNavigate();
  const isNew = category === undefined;
  const devMode = useDevMode();

  const [meta, setMeta] = useState<HelpCategoryMeta>(empty());
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !category) return;
    helpApi
      .getMeta(category)
      .then((m) => {
        if (m === null) setError("not found");
        else {
          setMeta(m);
          setLoaded(true);
        }
      })
      .catch((e) => setError(String(e)));
  }, [category, isNew]);

  if (!devMode) return <NotFoundPage />;
  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (!loaded) return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<HelpCategoryMeta>) =>
    setMeta({ ...meta, ...partial });

  const canSave = NAME_RE.test(meta.Category);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await helpApi.saveMeta(meta);
      dispatchHelpChanged();
      if (isNew) {
        navigate(`/help/${encodeURIComponent(saved.Category)}`, { replace: true });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew || !category) return;
    const ok = await showConfirm({
      title: `Delete category "${meta.DisplayName || meta.Category}"?`,
      message:
        "This removes the category folder and every entry inside it from disk. Cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await helpApi.removeCategory(category);
    dispatchHelpChanged();
    navigate("/help");
  };

  const colors = paletteColorClasses(meta.Color);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          <Link to="/help" className="text-neutral-400 hover:text-neutral-200">
            Help
          </Link>
          <span className="mx-2 text-neutral-600">/</span>
          {isNew ? "New category" : meta.DisplayName || meta.Category}
        </h1>
        <div className="flex gap-2">
          <ButtonLink
            to={isNew ? "/help" : `/help/${encodeURIComponent(meta.Category)}`}
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

      <section className={`space-y-4 border-2 ${colors.border} ${colors.surface} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Category id</span>
            <input
              value={meta.Category}
              onChange={(e) => update({ Category: e.target.value })}
              disabled={!isNew}
              placeholder="e.g. getting-started"
              className={`${textInput} font-mono disabled:cursor-not-allowed disabled:opacity-60`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Folder name on disk. Letters, digits, underscore, dash. Locked
              once saved.
            </span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Display name</span>
            <input
              value={meta.DisplayName}
              onChange={(e) => update({ DisplayName: e.target.value })}
              placeholder="e.g. Getting started"
              className={textInput}
            />
          </label>
        </div>

        <label className="block">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={meta.Description}
            onChange={(e) => update({ Description: e.target.value })}
            rows={2}
            placeholder="One short line shown under the category header."
            className={textInput}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Order</span>
            <input
              type="number"
              value={meta.Order}
              onChange={(e) => update({ Order: Number(e.target.value) || 0 })}
              className={`${textInput} font-mono`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Sort key on the Help index. Lower numbers first.
            </span>
          </label>
          <div className="block">
            <span className={fieldLabel}>Color</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {HELP_COLORS.map((c) => {
                const swatch = paletteColorClasses(c).swatch;
                const active = meta.Color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update({ Color: c as HelpColor })}
                    title={c}
                    className={`size-6 border-2 ${swatch} ${
                      active ? "border-white" : "border-neutral-700"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
