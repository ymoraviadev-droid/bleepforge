import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ButtonLink } from "../../components/Button";
import type {
  ObjectiveType,
  Quest,
  QuestObjective,
  QuestReward,
  RewardType,
} from "@bleepforge/shared";
import { questsApi } from "../../lib/api";
import { DL } from "../../components/CatalogDatalists";
import { showConfirm } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { useSyncRefresh } from "../../lib/sync/useSyncRefresh";
import { button, fieldLabel, textInput } from "../../styles/classes";

const OBJECTIVE_TYPES: ObjectiveType[] = [
  "CollectItem",
  "ReachLocation",
  "TalkToNpc",
  "KillNpc",
  "KillEnemyType",
];
const REWARD_TYPES: RewardType[] = ["Item", "Flag", "Credits"];

const emptyObjective = (): QuestObjective => ({
  Id: "",
  Description: "",
  Type: "CollectItem",
  TargetItem: "",
  TargetId: "",
  EnemyType: "",
  RequiredCount: 1,
  ConsumeOnTurnIn: true,
});

const emptyReward = (): QuestReward => ({
  Type: "Item",
  Item: "",
  Quantity: 1,
  FlagName: "",
  CreditAmount: 0,
});

const empty = (): Quest => ({
  Id: "",
  QuestGiverId: "",
  Title: "",
  Description: "",
  Objectives: [],
  Rewards: [],
  ActiveFlag: "",
  CompleteFlag: "",
  TurnedInFlag: "",
});

export function QuestEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === undefined;

  const [quest, setQuest] = useState<Quest | null>(isNew ? empty() : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    questsApi
      .get(id!)
      .then((q) => (q === null ? setError("not found") : setQuest(q)))
      .catch((e) => setError(String(e)));
  }, [id, isNew]);

  useSyncRefresh({
    domain: "quest",
    key: isNew ? undefined : id,
    onChange: () => {
      if (isNew || !id) return;
      questsApi.get(id).then((q) => q && setQuest(q)).catch(() => {});
    },
  });

  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (quest === null) return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<Quest>) => setQuest({ ...quest, ...partial });

  const updateObj = (idx: number, partial: Partial<QuestObjective>) =>
    update({
      Objectives: quest.Objectives.map((o, i) =>
        i === idx ? { ...o, ...partial } : o,
      ),
    });
  const addObj = () =>
    update({ Objectives: [...quest.Objectives, emptyObjective()] });
  const removeObj = (idx: number) =>
    update({ Objectives: quest.Objectives.filter((_, i) => i !== idx) });

  const updateReward = (idx: number, partial: Partial<QuestReward>) =>
    update({
      Rewards: quest.Rewards.map((r, i) => (i === idx ? { ...r, ...partial } : r)),
    });
  const addReward = () => update({ Rewards: [...quest.Rewards, emptyReward()] });
  const removeReward = (idx: number) =>
    update({ Rewards: quest.Rewards.filter((_, i) => i !== idx) });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await questsApi.save(quest);
      if (isNew) navigate(`/quests/${encodeURIComponent(saved.Id)}`, { replace: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    const ok = await showConfirm({
      title: `Delete quest "${quest.Id}"?`,
      message: "This removes the quest file from disk.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await questsApi.remove(quest.Id);
    navigate("/quests");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {isNew ? "New quest" : quest.Id || "(unnamed)"}
        </h1>
        <div className="flex gap-2">
          <ButtonLink to="/quests" variant="secondary">
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
            disabled={saving || !quest.Id}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 rounded border border-neutral-800 p-4">
        <label className="block">
          <span className={fieldLabel}>Id</span>
          <input
            value={quest.Id}
            onChange={(e) => update({ Id: e.target.value })}
            disabled={!isNew}
            placeholder="globally unique quest id"
            className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>QuestGiverId</span>
          <input
            value={quest.QuestGiverId}
            onChange={(e) => update({ QuestGiverId: e.target.value })}
            placeholder="NPC id"
            list={DL.npcIds}
            className={textInput}
          />
        </label>
        <label className="col-span-2 block">
          <span className={fieldLabel}>Title</span>
          <input
            value={quest.Title}
            onChange={(e) => update({ Title: e.target.value })}
            className={textInput}
          />
        </label>
        <label className="col-span-2 block">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={quest.Description}
            onChange={(e) => update({ Description: e.target.value })}
            rows={3}
            className={textInput}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>ActiveFlag</span>
          <input
            value={quest.ActiveFlag}
            onChange={(e) => update({ ActiveFlag: e.target.value })}
            placeholder="auto-set on start"
            list={DL.flags}
            className={textInput}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>CompleteFlag</span>
          <input
            value={quest.CompleteFlag}
            onChange={(e) => update({ CompleteFlag: e.target.value })}
            placeholder="auto-set on objectives complete"
            list={DL.flags}
            className={textInput}
          />
        </label>
        <label className="col-span-2 block">
          <span className={fieldLabel}>TurnedInFlag</span>
          <input
            value={quest.TurnedInFlag}
            onChange={(e) => update({ TurnedInFlag: e.target.value })}
            placeholder="auto-set on turn-in"
            list={DL.flags}
            className={textInput}
          />
        </label>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
            Objectives ({quest.Objectives.length})
          </h2>
          <button
            onClick={addObj}
            className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
          >
            + Objective
          </button>
        </div>
        <ol className="space-y-3">
          {quest.Objectives.map((obj, idx) => (
            <li key={idx} className="rounded border border-neutral-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-neutral-500">Objective {idx + 1}</span>
                <button
                  onClick={() => removeObj(idx)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>Id</span>
                  <input
                    value={obj.Id}
                    onChange={(e) => updateObj(idx, { Id: e.target.value })}
                    placeholder="unique within quest"
                    className={textInput}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Type</span>
                  <select
                    value={obj.Type}
                    onChange={(e) =>
                      updateObj(idx, { Type: e.target.value as ObjectiveType })
                    }
                    className={textInput}
                  >
                    {OBJECTIVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 block">
                  <span className={fieldLabel}>Description</span>
                  <input
                    value={obj.Description}
                    onChange={(e) =>
                      updateObj(idx, { Description: e.target.value })
                    }
                    className={textInput}
                  />
                </label>

                {obj.Type === "CollectItem" && (
                  <label className="block">
                    <span className={fieldLabel}>TargetItem (slug)</span>
                    <input
                      value={obj.TargetItem}
                      onChange={(e) =>
                        updateObj(idx, { TargetItem: e.target.value })
                      }
                      list={DL.itemSlugs}
                      className={textInput}
                    />
                  </label>
                )}
                {(obj.Type === "ReachLocation" ||
                  obj.Type === "TalkToNpc" ||
                  obj.Type === "KillNpc") && (
                  <label className="block">
                    <span className={fieldLabel}>TargetId</span>
                    <input
                      value={obj.TargetId}
                      onChange={(e) =>
                        updateObj(idx, { TargetId: e.target.value })
                      }
                      list={
                        obj.Type === "TalkToNpc" || obj.Type === "KillNpc"
                          ? DL.npcIds
                          : undefined
                      }
                      className={textInput}
                    />
                  </label>
                )}
                {obj.Type === "KillEnemyType" && (
                  <label className="block">
                    <span className={fieldLabel}>EnemyType</span>
                    <input
                      value={obj.EnemyType}
                      onChange={(e) =>
                        updateObj(idx, { EnemyType: e.target.value })
                      }
                      className={textInput}
                    />
                  </label>
                )}

                <label className="block">
                  <span className={fieldLabel}>RequiredCount</span>
                  <input
                    type="number"
                    value={obj.RequiredCount}
                    onChange={(e) =>
                      updateObj(idx, {
                        RequiredCount: parseInt(e.target.value) || 0,
                      })
                    }
                    className={textInput}
                  />
                </label>
                {obj.Type === "CollectItem" && (
                  <label className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={obj.ConsumeOnTurnIn}
                      onChange={(e) =>
                        updateObj(idx, { ConsumeOnTurnIn: e.target.checked })
                      }
                      className="size-4"
                    />
                    <span className="text-sm text-neutral-300">ConsumeOnTurnIn</span>
                  </label>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
            Rewards ({quest.Rewards.length})
          </h2>
          <button
            onClick={addReward}
            className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
          >
            + Reward
          </button>
        </div>
        <ol className="space-y-3">
          {quest.Rewards.map((reward, idx) => (
            <li key={idx} className="rounded border border-neutral-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-neutral-500">Reward {idx + 1}</span>
                <button
                  onClick={() => removeReward(idx)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>Type</span>
                  <select
                    value={reward.Type}
                    onChange={(e) =>
                      updateReward(idx, { Type: e.target.value as RewardType })
                    }
                    className={textInput}
                  >
                    {REWARD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                {reward.Type === "Item" && (
                  <>
                    <label className="block">
                      <span className={fieldLabel}>Item (slug)</span>
                      <input
                        value={reward.Item}
                        onChange={(e) =>
                          updateReward(idx, { Item: e.target.value })
                        }
                        list={DL.itemSlugs}
                        className={textInput}
                      />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Quantity</span>
                      <input
                        type="number"
                        value={reward.Quantity}
                        onChange={(e) =>
                          updateReward(idx, {
                            Quantity: parseInt(e.target.value) || 0,
                          })
                        }
                        className={textInput}
                      />
                    </label>
                  </>
                )}
                {reward.Type === "Flag" && (
                  <label className="block">
                    <span className={fieldLabel}>FlagName</span>
                    <input
                      value={reward.FlagName}
                      onChange={(e) =>
                        updateReward(idx, { FlagName: e.target.value })
                      }
                      list={DL.flags}
                      className={textInput}
                    />
                  </label>
                )}
                {reward.Type === "Credits" && (
                  <label className="block">
                    <span className={fieldLabel}>CreditAmount</span>
                    <input
                      type="number"
                      value={reward.CreditAmount}
                      onChange={(e) =>
                        updateReward(idx, {
                          CreditAmount: parseInt(e.target.value) || 0,
                        })
                      }
                      className={textInput}
                    />
                  </label>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
