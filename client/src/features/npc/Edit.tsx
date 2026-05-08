import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type {
  Item,
  Npc,
  NpcQuestEntry,
  LootEntry,
  Pickup,
} from "@bleepforge/shared";
import { itemsApi, npcsApi, pickupsApi } from "../../lib/api";
import { AssetPicker } from "../../components/AssetPicker";
import { AssetThumb } from "../../components/AssetThumb";
import { Button, ButtonLink } from "../../components/Button";
import { DL } from "../../components/CatalogDatalists";
import { useCatalog } from "../../lib/useCatalog";
import { useSyncRefresh } from "../../lib/sync/useSyncRefresh";
import { showConfirm } from "../../components/Modal";
import { SliderField } from "../../components/SliderField";
import { button, fieldLabel, textInput } from "../../styles/classes";

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
  CasualRemarks: [],
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

      <Section title="Casual remarks">
        <p className="mb-2 text-xs text-neutral-500">
          What this NPC says when the player walks up. Game picks one at
          random per encounter.
        </p>
        <CasualRemarksEditor
          remarks={npc.CasualRemarks}
          onChange={(CasualRemarks) => update({ CasualRemarks })}
        />
      </Section>

      <QuestsEditor
        entries={npc.Quests}
        onChange={(Quests) => update({ Quests })}
      />
      <LootEditor
        npc={npc}
        pickups={pickups}
        items={items}
        onChange={(LootTable) => update({ LootTable })}
      />
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

// Editable CasualRemarks[]. Array of balloon-ids in Bleepforge form
// "<folder>/<basename>" — each is an autocomplete input backed by
// DL.balloonIds, plus a small preview of the balloon's Text so the user
// sees what the NPC would say without leaving the page. Reorder via
// up/down buttons (Godot's Array<BalloonLine> is order-significant for
// random selection in the sense that all entries are equally weighted —
// but order helps the user keep mental sort).
function CasualRemarksEditor({
  remarks,
  onChange,
}: {
  remarks: string[];
  onChange: (next: string[]) => void;
}) {
  const catalog = useCatalog();
  const balloonByRef = new Map(
    (catalog?.balloonRefs ?? []).map((b) => [b.id, b.balloon] as const),
  );

  const update = (idx: number, value: string) => {
    onChange(remarks.map((r, i) => (i === idx ? value : r)));
  };
  const remove = (idx: number) => {
    onChange(remarks.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...remarks];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    onChange(next);
  };
  const add = () => onChange([...remarks, ""]);

  return (
    <div className="space-y-2">
      {remarks.length === 0 && (
        <p className="text-xs italic text-neutral-600">
          No remarks. Add one to give this NPC something to say when the
          player walks up.
        </p>
      )}
      {remarks.map((ref, idx) => {
        const balloon = balloonByRef.get(ref);
        return (
          <div
            key={idx}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-2 rounded border border-neutral-800 p-2"
          >
            <div>
              <input
                value={ref}
                onChange={(e) => update(idx, e.target.value)}
                list={DL.balloonIds}
                placeholder="<folder>/<id>, e.g. hap_500/eddie_greetings"
                className={`${textInput} font-mono text-xs`}
              />
              {balloon ? (
                <p className="mt-1 line-clamp-2 wrap-break-word font-mono text-[11px] text-neutral-300">
                  &ldquo;{balloon.Text || "(empty)"}&rdquo;
                </p>
              ) : ref ? (
                <p className="mt-1 font-mono text-[10px] text-red-400">
                  no balloon with that id
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              title="move up"
              className="self-start rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(idx, 1)}
              disabled={idx === remarks.length - 1}
              title="move down"
              className="self-start rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="self-start rounded px-2 py-1 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
      >
        + Remark
      </button>
    </div>
  );
}

// Editable Quests[]. Each entry binds the NPC to a Quest by Id and routes
// five dialog sequences (offer / accepted / in-progress / turn-in / post-quest)
// to the appropriate stage. The 2 flag fields duplicate Quest.ActiveFlag /
// Quest.TurnedInFlag — Godot's design, kept verbatim. Empty values save as
// omitted lines in the .tres (the writer drops null/empty sub-resource keys).
function QuestsEditor({
  entries,
  onChange,
}: {
  entries: NpcQuestEntry[];
  onChange: (next: NpcQuestEntry[]) => void;
}) {
  const addEntry = () => {
    onChange([
      ...entries,
      {
        QuestId: "",
        QuestActiveFlag: "",
        QuestTurnedInFlag: "",
        OfferDialog: "",
        AcceptedDialog: "",
        InProgressDialog: "",
        TurnInDialog: "",
        PostQuestDialog: "",
      },
    ]);
  };

  const updateEntry = (idx: number, patch: Partial<NpcQuestEntry>) => {
    onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEntry = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  return (
    <Section
      title={entries.length === 0 ? "Quests linked" : `Quests linked (${entries.length})`}
    >
      {entries.length === 0 ? (
        <div className="flex items-center justify-between rounded border border-dashed border-neutral-800 bg-neutral-900/40 p-3 text-xs text-neutral-400">
          <span>This NPC isn't wired to any quests.</span>
          <Button variant="secondary" size="sm" onClick={addEntry}>
            + Add quest
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div
              key={entry._subId ?? idx}
              className="space-y-2 rounded border border-neutral-800 bg-neutral-950/40 p-3 text-xs"
            >
              <div className="grid grid-cols-12 gap-2">
                <label className="col-span-10 block">
                  <span className={fieldLabel}>QuestId</span>
                  <input
                    value={entry.QuestId}
                    onChange={(e) => updateEntry(idx, { QuestId: e.target.value })}
                    list={DL.questIds}
                    placeholder="quest_id"
                    className={`${textInput} mt-0.5 font-mono`}
                  />
                </label>
                <div className="col-span-2 flex items-end justify-end">
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>QuestActiveFlag</span>
                  <input
                    value={entry.QuestActiveFlag}
                    onChange={(e) =>
                      updateEntry(idx, { QuestActiveFlag: e.target.value })
                    }
                    list={DL.flags}
                    className={`${textInput} mt-0.5 font-mono`}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabel}>QuestTurnedInFlag</span>
                  <input
                    value={entry.QuestTurnedInFlag}
                    onChange={(e) =>
                      updateEntry(idx, { QuestTurnedInFlag: e.target.value })
                    }
                    list={DL.flags}
                    className={`${textInput} mt-0.5 font-mono`}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <DialogRefField
                  label="OfferDialog"
                  value={entry.OfferDialog}
                  onChange={(OfferDialog) => updateEntry(idx, { OfferDialog })}
                />
                <DialogRefField
                  label="AcceptedDialog"
                  value={entry.AcceptedDialog}
                  onChange={(AcceptedDialog) => updateEntry(idx, { AcceptedDialog })}
                />
                <DialogRefField
                  label="InProgressDialog"
                  value={entry.InProgressDialog}
                  onChange={(InProgressDialog) =>
                    updateEntry(idx, { InProgressDialog })
                  }
                />
                <DialogRefField
                  label="TurnInDialog"
                  value={entry.TurnInDialog}
                  onChange={(TurnInDialog) => updateEntry(idx, { TurnInDialog })}
                />
                <DialogRefField
                  label="PostQuestDialog"
                  value={entry.PostQuestDialog}
                  onChange={(PostQuestDialog) =>
                    updateEntry(idx, { PostQuestDialog })
                  }
                />
              </div>
            </div>
          ))}
          <div className="flex justify-start">
            <Button variant="secondary" size="sm" onClick={addEntry}>
              + Add quest
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function DialogRefField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={DL.sequenceIds}
        placeholder="DialogSequence Id"
        className={`${textInput} mt-0.5 font-mono`}
      />
    </label>
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
                className="space-y-3 rounded border border-neutral-800 bg-neutral-950/40 p-3 text-xs"
              >
                <div className="flex items-end gap-2">
                  <label className="block flex-1 min-w-0">
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
                  </label>
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="text-[10px] text-red-400 hover:text-red-300 pb-2 whitespace-nowrap"
                  >
                    Remove
                  </button>
                </div>
                {wrapsItem && (
                  <p className="-mt-1 text-[10px] text-neutral-500">
                    wraps item:{" "}
                    <span className="font-mono text-neutral-300">
                      {pickup!.dbItemName}
                    </span>{" "}
                    ({wrapsItem})
                  </p>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <SliderField
                    label="Chance"
                    min={0}
                    max={1}
                    step={0.01}
                    value={entry.Chance}
                    onChange={(v) =>
                      updateEntry(idx, { Chance: clampFloat(v, 0, 1) })
                    }
                    format={(v) => v.toFixed(2)}
                  />
                  <SliderField
                    label="Min"
                    min={0}
                    max={20}
                    step={1}
                    value={entry.MinAmount}
                    onChange={(v) => updateEntry(idx, { MinAmount: v })}
                  />
                  <SliderField
                    label="Max"
                    min={0}
                    max={20}
                    step={1}
                    value={entry.MaxAmount}
                    onChange={(v) => updateEntry(idx, { MaxAmount: v })}
                  />
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
