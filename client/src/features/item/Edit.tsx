import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Item, ItemCategory } from "@bleepforge/shared";
import { itemsApi } from "../../lib/api";
import { AssetPicker } from "../../components/AssetPicker";
import { ButtonLink } from "../../components/Button";
import { ExternalChangeBanner } from "../../components/ExternalChangeBanner";
import { ItemIcon } from "../../components/ItemIcon";
import { DL } from "../../components/CatalogDatalists";
import { useExternalChange } from "../../lib/sync/useExternalChange";
import { useUnsavedWarning } from "../../lib/useUnsavedWarning";
import { showConfirm } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { button, fieldLabel, textInput } from "../../styles/classes";

import { PixelSkeleton } from "../../components/PixelSkeleton";
const CATEGORIES: ItemCategory[] = [
  "Misc",
  "Weapon",
  "QuestItem",
  "Upgrade",
  "Consumable",
];

const empty = (): Item => ({
  Slug: "",
  DisplayName: "",
  Description: "",
  Icon: "",
  IsStackable: true,
  MaxStack: 99,
  Price: 0,
  Category: "Misc",
  QuestId: "",
  CanDrop: false,
});

export function ItemEdit() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const isNew = slug === undefined;

  const [item, setItem] = useState<Item | null>(isNew ? empty() : null);
  /** Last-loaded / last-saved snapshot — dirty comparisons run against
   *  this. Stays null for the new-item form. */
  const [baseline, setBaseline] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    itemsApi
      .get(slug!)
      .then((it) => {
        if (it === null) {
          setError("not found");
          return;
        }
        setItem(it);
        setBaseline(it);
      })
      .catch((e) => setError(String(e)));
  }, [slug, isNew]);

  const reload = useCallback(() => {
    if (isNew || !slug) return;
    itemsApi
      .get(slug)
      .then((it) => {
        if (!it) return;
        setItem(it);
        setBaseline(it);
      })
      .catch(() => {});
  }, [isNew, slug]);

  const { dirty, externalChange, handleReload, handleDismiss } = useExternalChange({
    domain: "item",
    key: isNew ? undefined : slug,
    baseline,
    current: item,
    onReload: reload,
  });

  useUnsavedWarning(dirty);

  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (item === null) return <PixelSkeleton />;

  const update = (partial: Partial<Item>) => setItem({ ...item, ...partial });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await itemsApi.save(item);
      setItem(saved);
      setBaseline(saved);
      if (isNew) navigate(`/items/${encodeURIComponent(saved.Slug)}`, { replace: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    const ok = await showConfirm({
      title: `Delete item "${item.Slug}"?`,
      message: "This removes the item file from disk.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await itemsApi.remove(item.Slug);
    navigate("/items");
  };

  const isQuestItem = item.Category === "QuestItem";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isNew && item.Slug && <ItemIcon slug={item.Slug} size="lg" />}
          <h1 className="text-xl font-semibold">
            {isNew ? "New item" : item.Slug || "(unnamed)"}
          </h1>
        </div>
        <div className="flex gap-2">
          <ButtonLink to="/items" variant="secondary">
            ← Back
          </ButtonLink>
          {!isNew && (
            <button
              onClick={remove}
              className={`${button} bg-red-700 text-white hover:bg-red-600`}
            >
              Delete
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !item.Slug}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {externalChange && (
        <ExternalChangeBanner
          kind={externalChange.kind}
          onReload={handleReload}
          onDismiss={handleDismiss}
        />
      )}

      <section className="grid grid-cols-2 gap-4 rounded border border-neutral-800 p-4">
        <label className="block">
          <span className={fieldLabel}>Slug</span>
          <input
            value={item.Slug}
            onChange={(e) => update({ Slug: e.target.value })}
            disabled={!isNew}
            placeholder="globally unique slug"
            className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>DisplayName</span>
          <input
            value={item.DisplayName}
            onChange={(e) => update({ DisplayName: e.target.value })}
            className={textInput}
          />
        </label>

        <label className="col-span-2 block">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={item.Description}
            onChange={(e) => update({ Description: e.target.value })}
            rows={3}
            className={textInput}
          />
        </label>

        <div className="col-span-2 block">
          <span className={fieldLabel}>Icon</span>
          <div className="mt-1">
            <AssetPicker
              path={item.Icon}
              onChange={(Icon) => update({ Icon })}
              placeholder="absolute path to icon image"
            />
          </div>
        </div>

        <label className="block">
          <span className={fieldLabel}>Category</span>
          <select
            value={item.Category}
            onChange={(e) => update({ Category: e.target.value as ItemCategory })}
            className={textInput}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={fieldLabel}>Price</span>
          <input
            type="number"
            value={item.Price}
            onChange={(e) => update({ Price: parseInt(e.target.value) || 0 })}
            className={textInput}
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>MaxStack</span>
          <input
            type="number"
            value={item.MaxStack}
            onChange={(e) => update({ MaxStack: parseInt(e.target.value) || 0 })}
            className={textInput}
          />
        </label>

        <label className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.IsStackable}
            onChange={(e) => update({ IsStackable: e.target.checked })}
            className="size-4"
          />
          <span className="text-sm text-neutral-300">IsStackable</span>
        </label>
      </section>

      {isQuestItem && (
        <section className="grid grid-cols-2 gap-4 rounded border border-amber-800/50 bg-amber-950/20 p-4">
          <h2 className="col-span-2 text-sm font-semibold uppercase tracking-wide text-amber-300">
            QuestItem fields
          </h2>
          <label className="block">
            <span className={fieldLabel}>QuestId</span>
            <input
              value={item.QuestId}
              onChange={(e) => update({ QuestId: e.target.value })}
              placeholder="Quest.Id this item belongs to"
              list={DL.questIds}
              className={textInput}
            />
          </label>
          <label className="flex items-center gap-2 self-end">
            <input
              type="checkbox"
              checked={item.CanDrop}
              onChange={(e) => update({ CanDrop: e.target.checked })}
              className="size-4"
            />
            <span className="text-sm text-neutral-300">CanDrop</span>
          </label>
        </section>
      )}
    </div>
  );
}
