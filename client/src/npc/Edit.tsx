import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type {
  Item,
  Npc,
  NpcQuestEntry,
  LootEntry,
  Pickup,
} from "@bleepforge/shared";
import { itemsApi, npcsApi, pickupsApi } from "../api";
import { AssetPicker } from "../AssetPicker";
import { AssetThumb } from "../AssetThumb";
import { Button, ButtonLink } from "../Button";
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
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (isNew) return;
    npcsApi
      .get(npcId!)
      .then((n) => (n === null ? setError("not found") : setNpc(n)))
      .catch((e) => setError(String(e)));
  }, [npcId, isNew]);

  // Pickups (collectible scenes) + items: feed the LootTable editor.
  // Pickups give us the dropdown options; items resolve each pickup's
  // DbItemName to a friendly display name.
  useEffect(() => {
    pickupsApi.list().then(setPickups).catch(() => {});
    itemsApi.list().then(setItems).catch(() => {});
  }, []);

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
      <LootEditor
        npc={npc}
        pickups={pickups}
        items={items}
        onChange={(LootTable) => update({ LootTable })}
      />

      <p className="text-xs text-neutral-500">
        <span className="font-mono">Quests[]</span> is still round-trip-only —
        saving preserves it in the .tres, but the dialog↔quest bridge editor
        is Phase 3. Use Godot's inspector for now; the watcher syncs back.
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

// Editable LootTable. Add / remove rows, pick a collectible scene from the
// dropdown, edit chance + min/max amounts. Adding the first entry creates
// the LootTable wrapper; "Remove loot table" wipes it entirely (sets to
// null, which the writer translates to removing the LootTable sub-resource
// + its line on the NPC's [resource] section).
function LootEditor({
  npc,
  pickups,
  items,
  onChange,
}: {
  npc: Npc;
  pickups: Pickup[];
  items: Item[];
  onChange: (next: Npc["LootTable"]) => void;
}) {
  const lootTable = npc.LootTable;
  const entries = lootTable?.Entries ?? [];

  // Item slug → display name, for showing what each pickup wraps.
  const itemNameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.Slug, it.DisplayName || it.Slug);
    return m;
  }, [items]);

  const pickupByPath = useMemo(() => {
    const m = new Map<string, Pickup>();
    for (const p of pickups) m.set(p.path, p);
    return m;
  }, [pickups]);

  const addEntry = () => {
    const next: LootEntry = {
      PickupScene: pickups[0]?.path ?? "",
      Chance: 1,
      MinAmount: 1,
      MaxAmount: 1,
    };
    onChange({
      _subId: lootTable?._subId,
      Entries: [...entries, next],
    });
  };

  const updateEntry = (idx: number, patch: Partial<LootEntry>) => {
    const nextEntries = entries.map((e, i) =>
      i === idx ? { ...e, ...patch } : e,
    );
    onChange({ _subId: lootTable?._subId, Entries: nextEntries });
  };

  const removeEntry = (idx: number) => {
    const nextEntries = entries.filter((_, i) => i !== idx);
    onChange({ _subId: lootTable?._subId, Entries: nextEntries });
  };

  const removeTable = () => onChange(null);

  return (
    <Section
      title={
        lootTable
          ? `Loot table (${entries.length})`
          : "Loot table"
      }
    >
      {!lootTable ? (
        <div className="flex items-center justify-between rounded border border-dashed border-neutral-800 bg-neutral-900/40 p-3 text-xs text-neutral-400">
          <span>This NPC has no loot table.</span>
          <Button variant="secondary" size="sm" onClick={addEntry}>
            + Add entry
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="text-xs italic text-neutral-500">
              Empty loot table — saves with no entries. Either add an entry
              below or remove the table entirely.
            </p>
          )}
          {entries.map((entry, idx) => {
            const pickup = pickupByPath.get(entry.PickupScene);
            const wrapsItem = pickup?.dbItemName
              ? itemNameBySlug.get(pickup.dbItemName) ?? pickup.dbItemName
              : null;
            const known = !!pickup;
            return (
              <div
                key={entry._subId ?? idx}
                className="grid grid-cols-12 items-center gap-2 rounded border border-neutral-800 bg-neutral-950/40 p-2 text-xs"
              >
                <label className="col-span-6 block">
                  <span className={fieldLabel}>Pickup scene</span>
                  <select
                    value={entry.PickupScene}
                    onChange={(e) =>
                      updateEntry(idx, { PickupScene: e.target.value })
                    }
                    className={`${textInput} mt-0.5 font-mono text-[11px] ${
                      !known && entry.PickupScene
                        ? "border-red-700 text-red-200"
                        : ""
                    }`}
                  >
                    {/* Preserve the existing value as an option even if it's
                        not in the picker list (stale ref / scene removed) so
                        the user can see what's there before fixing it. */}
                    {entry.PickupScene && !known && (
                      <option value={entry.PickupScene}>
                        ⚠ missing — {entry.PickupScene}
                      </option>
                    )}
                    {pickups.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.name}
                        {p.dbItemName
                          ? ` → ${itemNameBySlug.get(p.dbItemName) ?? p.dbItemName}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {wrapsItem && (
                    <p className="mt-0.5 text-[10px] text-neutral-500">
                      wraps item:{" "}
                      <span className="font-mono text-neutral-300">
                        {pickup!.dbItemName}
                      </span>{" "}
                      ({wrapsItem})
                    </p>
                  )}
                </label>
                <label className="col-span-2 block">
                  <span className={fieldLabel}>Chance</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={entry.Chance}
                    onChange={(e) =>
                      updateEntry(idx, {
                        Chance: clampFloat(parseFloat(e.target.value), 0, 1),
                      })
                    }
                    className={`${textInput} mt-0.5 font-mono`}
                  />
                </label>
                <label className="col-span-1 block">
                  <span className={fieldLabel}>Min</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={entry.MinAmount}
                    onChange={(e) =>
                      updateEntry(idx, {
                        MinAmount: parseInt(e.target.value) || 0,
                      })
                    }
                    className={`${textInput} mt-0.5 font-mono`}
                  />
                </label>
                <label className="col-span-1 block">
                  <span className={fieldLabel}>Max</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={entry.MaxAmount}
                    onChange={(e) =>
                      updateEntry(idx, {
                        MaxAmount: parseInt(e.target.value) || 0,
                      })
                    }
                    className={`${textInput} mt-0.5 font-mono`}
                  />
                </label>
                <div className="col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={addEntry}>
              + Add entry
            </Button>
            <button
              type="button"
              onClick={removeTable}
              className="text-[10px] text-red-400 hover:text-red-300"
            >
              Remove loot table
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function clampFloat(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}
