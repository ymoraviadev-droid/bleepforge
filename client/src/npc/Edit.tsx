import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ButtonLink } from "../Button";
import type { Npc } from "@bleepforge/shared";
import { npcsApi } from "../api";
import { AssetPicker } from "../AssetPicker";
import { showConfirm } from "../Modal";
import { button, fieldLabel, textInput } from "../ui";

const empty = (): Npc => ({
  NpcId: "",
  DisplayName: "",
  Description: "",
  Portraits: [],
  Sprites: [],
});

export function NpcEdit() {
  const { npcId } = useParams();
  const navigate = useNavigate();
  const isNew = npcId === undefined;

  const [npc, setNpc] = useState<Npc | null>(isNew ? empty() : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    npcsApi
      .get(npcId!)
      .then((n) => (n === null ? setError("not found") : setNpc(n)))
      .catch((e) => setError(String(e)));
  }, [npcId, isNew]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (npc === null) return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<Npc>) => setNpc({ ...npc, ...partial });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await npcsApi.save(npc);
      if (isNew) navigate(`/npcs/${encodeURIComponent(saved.NpcId)}`, { replace: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    const ok = await showConfirm({
      title: `Delete NPC "${npc.NpcId}"?`,
      message: "This removes the NPC documentation file from disk.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await npcsApi.remove(npc.NpcId);
    navigate("/npcs");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {isNew ? "New NPC" : npc.NpcId || "(unnamed)"}
        </h1>
        <div className="flex gap-2">
          <ButtonLink to="/npcs" variant="secondary">
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
            disabled={saving || !npc.NpcId}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <label className="block">
          <span className={fieldLabel}>NpcId</span>
          <input
            value={npc.NpcId}
            onChange={(e) => update({ NpcId: e.target.value })}
            disabled={!isNew}
            placeholder="globally unique NPC id (matches NpcId in Godot)"
            className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>DisplayName</span>
          <input
            value={npc.DisplayName}
            onChange={(e) => update({ DisplayName: e.target.value })}
            className={textInput}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={npc.Description}
            onChange={(e) => update({ Description: e.target.value })}
            rows={4}
            placeholder="Notes about this NPC — role, personality, where they appear, etc."
            className={textInput}
          />
        </label>
      </section>

      <PathArrayField
        label="Portraits"
        paths={npc.Portraits}
        onChange={(Portraits) => update({ Portraits })}
        placeholder="absolute path to portrait image (e.g. /home/you/aseprite/eddie/portrait1.png)"
      />

      <PathArrayField
        label="Sprites"
        paths={npc.Sprites}
        onChange={(Sprites) => update({ Sprites })}
        placeholder="absolute path to sprite image"
      />
    </div>
  );
}

interface PathArrayFieldProps {
  label: string;
  paths: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function PathArrayField({ label, paths, onChange, placeholder }: PathArrayFieldProps) {
  const singular = label.endsWith("s") ? label.slice(0, -1) : label;
  return (
    <section className="rounded border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
          {label} ({paths.length})
        </h2>
        <button
          onClick={() => onChange([...paths, ""])}
          className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
        >
          + {singular}
        </button>
      </div>
      {paths.length === 0 ? (
        <p className="text-xs text-neutral-600">No {label.toLowerCase()} yet.</p>
      ) : (
        <ul className="space-y-2">
          {paths.map((p, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <div className="flex-1">
                <AssetPicker
                  path={p}
                  onChange={(next) => {
                    const arr = [...paths];
                    arr[idx] = next;
                    onChange(arr);
                  }}
                  placeholder={placeholder}
                />
              </div>
              <button
                onClick={() => onChange(paths.filter((_, i) => i !== idx))}
                className="text-xs text-red-400 hover:text-red-300"
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
