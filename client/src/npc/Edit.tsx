import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Npc, NpcQuestEntry, LootEntry } from "@bleepforge/shared";
import { npcsApi } from "../api";
import { AssetPicker } from "../AssetPicker";
import { AssetThumb } from "../AssetThumb";
import { ButtonLink } from "../Button";
import { DL } from "../CatalogDatalists";
import { useSyncRefresh } from "../sync/useSyncRefresh";
import { showConfirm } from "../Modal";
import { button, fieldLabel, textInput } from "../ui";

const empty = (): Npc => ({
  NpcId: "",
  DisplayName: "",
  MemoryEntryId: "",
  Portrait: "",
  DefaultDialog: "",
  OffendedDialog: "",
  OffendedFlag: "",
  Quests: [],
  DeathImpactId: "",
  DeathImpactIdContextual: "",
  ContextualFlag: "",
  LootTable: null,
  CasualRemark: "",
  DidSpeakFlag: "",
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

  useSyncRefresh({
    domain: "npc",
    key: isNew ? undefined : npcId,
    onChange: () => {
      if (isNew || !npcId) return;
      npcsApi.get(npcId).then((n) => n && setNpc(n)).catch(() => {});
    },
  });

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (npc === null) return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<Npc>) => setNpc({ ...npc, ...partial });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await npcsApi.save(npc);
      if (isNew)
        navigate(`/npcs/${encodeURIComponent(saved.NpcId)}`, { replace: true });
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
      message:
        "This removes the JSON from Bleepforge. The .tres in Godot is left alone.",
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
        <div className="flex items-center gap-3">
          {npc.Portrait && <AssetThumb path={npc.Portrait} size="lg" />}
          <h1 className="text-xl font-semibold">
            {isNew ? "New NPC" : npc.DisplayName || npc.NpcId || "(unnamed)"}
          </h1>
        </div>
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

      <Section title="Identity">
        <div className="grid grid-cols-2 gap-4">
          <Field label="NpcId">
            <input
              value={npc.NpcId}
              onChange={(e) => update({ NpcId: e.target.value })}
              disabled={!isNew}
              placeholder="e.g. eddie"
              className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </Field>
          <Field label="DisplayName">
            <input
              value={npc.DisplayName}
              onChange={(e) => update({ DisplayName: e.target.value })}
              className={textInput}
            />
          </Field>
          <Field label="MemoryEntryId" hint="Robot model — e.g. hap_500, sld_300">
            <input
              value={npc.MemoryEntryId}
              onChange={(e) => update({ MemoryEntryId: e.target.value })}
              className={textInput}
            />
          </Field>
          <Field label="Portrait">
            <AssetPicker
              path={npc.Portrait}
              onChange={(Portrait) => update({ Portrait })}
              placeholder="absolute path to portrait image"
            />
          </Field>
        </div>
      </Section>

      <Section title="Dialog & flags">
        <div className="grid grid-cols-2 gap-4">
          <Field label="DefaultDialog" hint="DialogSequence Id">
            <input
              value={npc.DefaultDialog}
              onChange={(e) => update({ DefaultDialog: e.target.value })}
              list={DL.sequenceIds}
              className={textInput}
            />
          </Field>
          <Field label="OffendedDialog" hint="DialogSequence Id">
            <input
              value={npc.OffendedDialog}
              onChange={(e) => update({ OffendedDialog: e.target.value })}
              list={DL.sequenceIds}
              className={textInput}
            />
          </Field>
          <Field label="OffendedFlag">
            <input
              value={npc.OffendedFlag}
              onChange={(e) => update({ OffendedFlag: e.target.value })}
              list={DL.flags}
              className={textInput}
            />
          </Field>
          <Field label="DidSpeakFlag">
            <input
              value={npc.DidSpeakFlag}
              onChange={(e) => update({ DidSpeakFlag: e.target.value })}
              list={DL.flags}
              className={textInput}
            />
          </Field>
        </div>
      </Section>

      <Section title="Karma">
        <div className="grid grid-cols-2 gap-4">
          <Field label="DeathImpactId" hint="KarmaImpact.Id">
            <input
              value={npc.DeathImpactId}
              onChange={(e) => update({ DeathImpactId: e.target.value })}
              className={textInput}
            />
          </Field>
          <Field
            label="DeathImpactIdContextual"
            hint="Applied when ContextualFlag is set"
          >
            <input
              value={npc.DeathImpactIdContextual}
              onChange={(e) =>
                update({ DeathImpactIdContextual: e.target.value })
              }
              className={textInput}
            />
          </Field>
          <Field label="ContextualFlag" hint="Gates the contextual death impact">
            <input
              value={npc.ContextualFlag}
              onChange={(e) => update({ ContextualFlag: e.target.value })}
              list={DL.flags}
              className={textInput}
            />
          </Field>
        </div>
      </Section>

      <Section title="Misc">
        <div className="grid grid-cols-1 gap-4">
          <Field
            label="CasualRemark"
            hint="res:// path to a BalloonLine .tres"
          >
            <input
              value={npc.CasualRemark}
              onChange={(e) => update({ CasualRemark: e.target.value })}
              placeholder='e.g. res://characters/npcs/.../greeting.tres'
              className={`${textInput} font-mono text-xs`}
            />
          </Field>
        </div>
      </Section>

      <QuestsReadOnly entries={npc.Quests} />
      <LootReadOnly entries={npc.LootTable?.Entries ?? []} />

      <p className="text-xs text-neutral-500">
        v1: this form authors the scalar fields. <span className="font-mono">Quests[]</span>{" "}
        and <span className="font-mono">LootTable.Entries[]</span> are
        round-tripped — saving here preserves them in the .tres untouched but
        doesn't currently let you author them. To edit, use Godot's inspector
        and the changes will live-sync back here.
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded border border-neutral-800 p-4">
      <h2 className="font-display text-xs tracking-wider text-emerald-400">
        {title.toUpperCase()}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-neutral-500">{hint}</p>}
    </label>
  );
}

function QuestsReadOnly({ entries }: { entries: NpcQuestEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Section title={`Quests linked (${entries.length}, read-only)`}>
      <div className="space-y-2">
        {entries.map((q, i) => (
          <div
            key={q._subId ?? i}
            className="space-y-1 rounded border border-neutral-800 bg-neutral-950/40 p-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-emerald-300">{q.QuestId || "(no QuestId)"}</span>
              <span className="text-neutral-500">·</span>
              <span className="font-mono text-neutral-500">
                {q.QuestActiveFlag || "—"}
              </span>
              <span className="text-neutral-500">·</span>
              <span className="font-mono text-neutral-500">
                {q.QuestTurnedInFlag || "—"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 text-[11px]">
              <DialogRefRow label="Offer" id={q.OfferDialog} />
              <DialogRefRow label="Accepted" id={q.AcceptedDialog} />
              <DialogRefRow label="In progress" id={q.InProgressDialog} />
              <DialogRefRow label="Turn in" id={q.TurnInDialog} />
              <DialogRefRow label="Post quest" id={q.PostQuestDialog} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DialogRefRow({ label, id }: { label: string; id: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-20 shrink-0 text-neutral-500">{label}</span>
      <span className={`font-mono ${id ? "text-neutral-200" : "text-neutral-700"}`}>
        {id || "—"}
      </span>
    </div>
  );
}

function LootReadOnly({ entries }: { entries: LootEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Section title={`Loot table (${entries.length}, read-only)`}>
      <table className="w-full text-xs">
        <thead className="text-neutral-500">
          <tr>
            <th className="pb-1 text-left font-medium">Pickup scene</th>
            <th className="pb-1 text-right font-medium">Chance</th>
            <th className="pb-1 text-right font-medium">Min</th>
            <th className="pb-1 text-right font-medium">Max</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {entries.map((e, i) => (
            <tr key={e._subId ?? i} className="border-t border-neutral-800">
              <td className="py-1 pr-2 text-neutral-200">
                {e.PickupScene || (
                  <span className="italic text-neutral-600">—</span>
                )}
              </td>
              <td className="py-1 text-right text-neutral-300">{e.Chance}</td>
              <td className="py-1 text-right text-neutral-300">{e.MinAmount}</td>
              <td className="py-1 text-right text-neutral-300">{e.MaxAmount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
