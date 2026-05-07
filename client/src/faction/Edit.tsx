import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Faction, FactionData } from "@bleepforge/shared";
import { factionsApi } from "../api";
import { AssetPicker } from "../AssetPicker";
import { AssetThumb } from "../AssetThumb";
import { ButtonLink } from "../Button";
import { useSyncRefresh } from "../sync/useSyncRefresh";
import { showConfirm } from "../Modal";
import { button, fieldLabel, textInput } from "../ui";

const FACTIONS: Faction[] = ["Scavengers", "FreeRobots", "RFF", "Grove"];

const empty = (): FactionData => ({
  Faction: "Scavengers",
  DisplayName: "",
  Icon: "",
  Banner: "",
  ShortDescription: "",
});

export function FactionEdit() {
  const { faction: factionParam } = useParams();
  const navigate = useNavigate();
  const isNew = factionParam === undefined;

  const [data, setData] = useState<FactionData | null>(isNew ? empty() : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    factionsApi
      .get(factionParam!)
      .then((d) => (d === null ? setError("not found") : setData(d)))
      .catch((e) => setError(String(e)));
  }, [factionParam, isNew]);

  useSyncRefresh({
    domain: "faction",
    key: isNew ? undefined : factionParam,
    onChange: () => {
      if (isNew || !factionParam) return;
      factionsApi
        .get(factionParam)
        .then((d) => d && setData(d))
        .catch(() => {});
    },
  });

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (data === null) return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<FactionData>) =>
    setData({ ...data, ...partial });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await factionsApi.save(data);
      if (isNew) {
        navigate(`/factions/${encodeURIComponent(saved.Faction)}`, {
          replace: true,
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    const ok = await showConfirm({
      title: `Delete faction "${data.Faction}"?`,
      message:
        "This removes the faction file from disk. The .tres in Godot is left alone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await factionsApi.remove(data.Faction);
    navigate("/factions");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {data.Icon && <AssetThumb path={data.Icon} size="lg" />}
          <h1 className="text-xl font-semibold">
            {isNew ? "New faction" : data.DisplayName || data.Faction}
          </h1>
        </div>
        <div className="flex gap-2">
          <ButtonLink to="/factions" variant="secondary">
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
            disabled={saving}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 rounded border border-neutral-800 p-4">
        <label className="block">
          <span className={fieldLabel}>Faction</span>
          <select
            value={data.Faction}
            onChange={(e) => update({ Faction: e.target.value as Faction })}
            disabled={!isNew}
            className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {FACTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={fieldLabel}>DisplayName</span>
          <input
            value={data.DisplayName}
            onChange={(e) => update({ DisplayName: e.target.value })}
            placeholder='e.g. "Inner Sanctum Grove"'
            className={textInput}
          />
        </label>

        <label className="col-span-2 block">
          <span className={fieldLabel}>ShortDescription</span>
          <textarea
            value={data.ShortDescription}
            onChange={(e) => update({ ShortDescription: e.target.value })}
            rows={4}
            className={textInput}
          />
        </label>

        <div className="block">
          <span className={fieldLabel}>Icon</span>
          <div className="mt-1">
            <AssetPicker
              path={data.Icon}
              onChange={(Icon) => update({ Icon })}
              placeholder="absolute path to icon"
            />
          </div>
        </div>

        <div className="block">
          <span className={fieldLabel}>Banner</span>
          <div className="mt-1">
            <AssetPicker
              path={data.Banner}
              onChange={(Banner) => update({ Banner })}
              placeholder="absolute path to banner"
            />
          </div>
        </div>
      </section>

      <p className="text-xs text-neutral-500">
        Icon and Banner edits live in Bleepforge JSON only. The .tres mapper
        round-trips DisplayName + ShortDescription back to the Godot project,
        but ext-resource refs (Texture2D paths) aren't reconciled — same
        deferred behavior as Item.Icon. Update them in Godot's inspector for
        in-game changes.
      </p>
    </div>
  );
}
