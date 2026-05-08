import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { Balloon, Npc } from "@bleepforge/shared";
import { balloonsApi, npcsApi } from "../../lib/api";
import { ButtonLink } from "../../components/Button";
import { showConfirm } from "../../components/Modal";
import { useSyncRefresh } from "../../lib/sync/useSyncRefresh";
import { button, fieldLabel, textInput } from "../../styles/classes";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

const empty = (): Balloon => ({
  Id: "",
  Text: "",
  TypeSpeed: 30,
  HoldDuration: 2,
});

// One-page form for a BalloonLine. Tiny — three real fields plus the
// folder/id identity tags (locked once saved, since the .tres lives at a
// fixed path). The "Used by" panel surfaces the reverse lookup so the user
// can jump to any NPC that speaks this balloon.

export function BalloonEdit() {
  const { folder: routeFolder, basename } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const isNew = basename === undefined;

  // For "new", we accept ?folder=<model> as a prefill from the list page
  // (lets the user click a model card and start editing in that folder).
  const initialFolder = routeFolder ?? search.get("folder") ?? "";

  const [folder, setFolder] = useState<string>(initialFolder);
  const [balloon, setBalloon] = useState<Balloon | null>(isNew ? empty() : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [npcs, setNpcs] = useState<Npc[]>([]);

  useEffect(() => {
    if (isNew) return;
    if (!routeFolder || !basename) return;
    balloonsApi
      .get(routeFolder, basename)
      .then((b) => (b === null ? setError("not found") : setBalloon(b)))
      .catch((e) => setError(String(e)));
  }, [routeFolder, basename, isNew]);

  useEffect(() => {
    npcsApi.list().then(setNpcs).catch(() => {});
  }, []);

  // Live updates: if the .tres changes externally, refresh in place.
  useSyncRefresh({
    domain: "balloon",
    key: isNew ? undefined : `${routeFolder}/${basename}`,
    onChange: () => {
      if (isNew || !routeFolder || !basename) return;
      balloonsApi.get(routeFolder, basename).then((b) => b && setBalloon(b)).catch(() => {});
    },
  });
  useSyncRefresh({
    domain: "npc",
    onChange: () => npcsApi.list().then(setNpcs).catch(() => {}),
  });

  const ref = balloon ? `${folder}/${balloon.Id}` : "";
  const usedBy = useMemo(
    () => (ref ? npcs.filter((n) => n.CasualRemarks.includes(ref)) : []),
    [ref, npcs],
  );

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (balloon === null) return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<Balloon>) =>
    setBalloon({ ...balloon, ...partial });

  const canSave =
    folder !== "" && balloon.Id !== "" && NAME_RE.test(folder) && NAME_RE.test(balloon.Id);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await balloonsApi.save(folder, balloon);
      if (isNew) {
        navigate(
          `/balloons/${encodeURIComponent(folder)}/${encodeURIComponent(saved.Id)}`,
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
    if (isNew || !routeFolder || !basename) return;
    const ok = await showConfirm({
      title: `Delete balloon "${routeFolder}/${basename}"?`,
      message:
        "This removes the cached JSON. The .tres in Godot is left alone — delete it from Godot if you want it fully gone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await balloonsApi.remove(routeFolder, basename);
    navigate("/balloons");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {isNew ? "New balloon" : `${folder} / ${balloon.Id}`}
        </h1>
        <div className="flex gap-2">
          <ButtonLink to="/balloons" variant="secondary">
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
            disabled={saving || !canSave}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Model folder</span>
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              disabled={!isNew}
              placeholder="e.g. hap_500"
              className={`${textInput} font-mono disabled:cursor-not-allowed disabled:opacity-60`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              NPC robot model directory (the parent of <span className="font-mono">balloons/</span>).
            </span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Id</span>
            <input
              value={balloon.Id}
              onChange={(e) => update({ Id: e.target.value })}
              disabled={!isNew}
              placeholder="e.g. eddie_greetings"
              className={`${textInput} font-mono disabled:cursor-not-allowed disabled:opacity-60`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              .tres filename basename (no extension).
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <label className="block">
          <span className={fieldLabel}>Text</span>
          <textarea
            value={balloon.Text}
            onChange={(e) => update({ Text: e.target.value })}
            rows={4}
            placeholder="What the NPC says when the player walks up."
            className={`${textInput} font-mono`}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Type speed</span>
            <input
              type="number"
              step="0.1"
              value={balloon.TypeSpeed}
              onChange={(e) =>
                update({ TypeSpeed: parseFloat(e.target.value) || 0 })
              }
              className={textInput}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Characters per second. 0 = instant. Godot default: 30.
            </span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Hold duration</span>
            <input
              type="number"
              step="0.1"
              value={balloon.HoldDuration}
              onChange={(e) =>
                update({ HoldDuration: parseFloat(e.target.value) || 0 })
              }
              className={textInput}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Seconds visible after typing finishes. Godot default: 2.0.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-300">
          Used by
        </h2>
        {isNew ? (
          <p className="text-xs italic text-neutral-600">
            (saves first, then the reverse lookup populates)
          </p>
        ) : usedBy.length === 0 ? (
          <p className="text-xs italic text-neutral-600">
            No NPC references this balloon yet. Add{" "}
            <span className="font-mono">{ref}</span> to an NPC's{" "}
            <span className="font-mono">CasualRemarks</span> on the NPC edit page.
          </p>
        ) : (
          <ul className="space-y-1">
            {usedBy.map((n) => (
              <li key={n.NpcId}>
                <Link
                  to={`/npcs/${encodeURIComponent(n.NpcId)}`}
                  className="font-mono text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                >
                  {n.DisplayName ? `${n.DisplayName} (${n.NpcId})` : n.NpcId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
