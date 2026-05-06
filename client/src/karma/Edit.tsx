import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Faction, KarmaDelta, KarmaImpact } from "@bleepforge/shared";
import { karmaApi } from "../api";
import { showConfirm } from "../Modal";
import { button, fieldLabel, textInput } from "../ui";

const FACTIONS: Faction[] = ["Scavengers", "FreeRobots", "RFF", "Grove"];

const emptyDelta = (): KarmaDelta => ({ Faction: "Scavengers", Amount: 0 });
const empty = (): KarmaImpact => ({ Id: "", Description: "", Deltas: [] });

export function KarmaEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === undefined;

  const [impact, setImpact] = useState<KarmaImpact | null>(isNew ? empty() : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    karmaApi
      .get(id!)
      .then((k) => (k === null ? setError("not found") : setImpact(k)))
      .catch((e) => setError(String(e)));
  }, [id, isNew]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (impact === null) return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<KarmaImpact>) =>
    setImpact({ ...impact, ...partial });

  const updateDelta = (idx: number, partial: Partial<KarmaDelta>) =>
    update({
      Deltas: impact.Deltas.map((d, i) => (i === idx ? { ...d, ...partial } : d)),
    });

  const addDelta = () => update({ Deltas: [...impact.Deltas, emptyDelta()] });
  const removeDelta = (idx: number) =>
    update({ Deltas: impact.Deltas.filter((_, i) => i !== idx) });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await karmaApi.save(impact);
      if (isNew) navigate(`/karma/${encodeURIComponent(saved.Id)}`, { replace: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    const ok = await showConfirm({
      title: `Delete karma impact "${impact.Id}"?`,
      message: "This removes the impact file from disk.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await karmaApi.remove(impact.Id);
    navigate("/karma");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/karma"
        className="inline-flex items-center text-xs text-neutral-400 hover:text-neutral-200"
      >
        ← Back to Karma
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {isNew ? "New impact" : impact.Id || "(unnamed)"}
        </h1>
        <div className="flex gap-2">
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
            disabled={saving || !impact.Id}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <label className="block">
          <span className={fieldLabel}>Id</span>
          <input
            value={impact.Id}
            onChange={(e) => update({ Id: e.target.value })}
            disabled={!isNew}
            placeholder="globally unique impact id"
            className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={impact.Description}
            onChange={(e) => update({ Description: e.target.value })}
            rows={2}
            className={textInput}
          />
        </label>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
            Deltas ({impact.Deltas.length})
          </h2>
          <button
            onClick={addDelta}
            className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
          >
            + Delta
          </button>
        </div>

        {impact.Deltas.length === 0 ? (
          <p className="text-xs text-neutral-600">No deltas yet.</p>
        ) : (
          <ul className="space-y-2">
            {impact.Deltas.map((delta, idx) => (
              <li
                key={idx}
                className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded border border-neutral-800 p-3"
              >
                <label className="block">
                  <span className={fieldLabel}>Faction</span>
                  <select
                    value={delta.Faction}
                    onChange={(e) =>
                      updateDelta(idx, { Faction: e.target.value as Faction })
                    }
                    className={textInput}
                  >
                    {FACTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={fieldLabel}>Amount</span>
                  <input
                    type="number"
                    value={delta.Amount}
                    onChange={(e) =>
                      updateDelta(idx, { Amount: parseInt(e.target.value) || 0 })
                    }
                    className={textInput}
                  />
                </label>
                <button
                  onClick={() => removeDelta(idx)}
                  className="self-end pb-2 text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
