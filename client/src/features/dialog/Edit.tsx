import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ButtonLink } from "../../components/Button";
import type {
  DialogChoice,
  DialogLine,
  DialogSequence,
  DialogSourceType,
} from "@bleepforge/shared";
import { dialogsApi } from "../../lib/api";
import { useDialogs } from "../../lib/stores";
import { AssetPicker } from "../../components/AssetPicker";
import { DL } from "../../components/CatalogDatalists";
import { ExternalChangeBanner } from "../../components/ExternalChangeBanner";
import { showConfirm } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { useExternalChange } from "../../lib/sync/useExternalChange";
import { useUnsavedWarning } from "../../lib/useUnsavedWarning";
import { button, fieldLabel, textInput } from "../../styles/classes";

import { PixelSkeleton } from "../../components/PixelSkeleton";
import { DirtyDot } from "../../components/DirtyDot";
const emptyChoice = (): DialogChoice => ({
  Text: "",
  NextSequenceId: "",
  SetsFlag: "",
});
const emptyLine = (): DialogLine => ({
  SpeakerName: "",
  Text: "",
  Portrait: "",
  Choices: [],
});
const emptySequence = (): DialogSequence => ({
  Id: "",
  SourceType: "Npc",
  Lines: [],
  SetsFlag: "",
});

const SOURCE_TYPES: DialogSourceType[] = ["Npc", "Terminal"];

export function DialogEdit() {
  const { folder: folderParam, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = id === undefined;

  const { data: dialogGroups, status, error: storeError } = useDialogs();
  const fromStore =
    !isNew && folderParam && id && dialogGroups
      ? dialogGroups.find((g) => g.folder === folderParam)?.sequences.find((s) => s.Id === id)
      : undefined;

  const [folder, setFolder] = useState<string>(
    folderParam ?? searchParams.get("folder") ?? "",
  );
  // listFolders still needed for the folder dropdown (includes empty
  // folders the store doesn't know about).
  const [folders, setFolders] = useState<string[]>([]);
  const [seq, setSeq] = useState<DialogSequence | null>(isNew ? emptySequence() : null);
  /** Last-loaded / last-saved snapshot — dirty comparisons run against
   *  this. Stays null for the new-sequence form. */
  const [baseline, setBaseline] = useState<DialogSequence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialogsApi.listFolders().then(setFolders).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    if (baseline !== null) return;
    if (!folderParam || !id) return;
    if (status === "loading" || status === "idle") return;
    if (status === "error") {
      setError(storeError ?? "failed to load dialogs");
      return;
    }
    if (!fromStore) {
      setError("not found");
      return;
    }
    setSeq(fromStore);
    setBaseline(fromStore);
  }, [isNew, baseline, folderParam, id, status, storeError, fromStore]);

  const reload = useCallback(() => {
    if (isNew || !folderParam || !id) return;
    const fresh = dialogGroups
      ?.find((g) => g.folder === folderParam)
      ?.sequences.find((s) => s.Id === id);
    if (!fresh) return;
    setSeq(fresh);
    setBaseline(fresh);
  }, [isNew, folderParam, id, dialogGroups]);

  const { dirty, externalChange, handleReload, handleDismiss } = useExternalChange({
    domain: "dialog",
    key: isNew || !folderParam || !id ? undefined : `${folderParam}/${id}`,
    baseline,
    current: seq,
    onReload: reload,
  });

  useUnsavedWarning(dirty);

  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (seq === null) return <PixelSkeleton />;

  const updateLine = (lineIdx: number, partial: Partial<DialogLine>) => {
    setSeq({
      ...seq,
      Lines: seq.Lines.map((l, i) => (i === lineIdx ? { ...l, ...partial } : l)),
    });
  };

  const addLine = () => setSeq({ ...seq, Lines: [...seq.Lines, emptyLine()] });
  const removeLine = (lineIdx: number) =>
    setSeq({ ...seq, Lines: seq.Lines.filter((_, i) => i !== lineIdx) });

  const addChoice = (lineIdx: number) => {
    const line = seq.Lines[lineIdx];
    if (!line) return;
    updateLine(lineIdx, { Choices: [...line.Choices, emptyChoice()] });
  };
  const updateChoice = (
    lineIdx: number,
    choiceIdx: number,
    partial: Partial<DialogChoice>,
  ) => {
    const line = seq.Lines[lineIdx];
    if (!line) return;
    updateLine(lineIdx, {
      Choices: line.Choices.map((c, i) =>
        i === choiceIdx ? { ...c, ...partial } : c,
      ),
    });
  };
  const removeChoice = (lineIdx: number, choiceIdx: number) => {
    const line = seq.Lines[lineIdx];
    if (!line) return;
    updateLine(lineIdx, {
      Choices: line.Choices.filter((_, i) => i !== choiceIdx),
    });
  };

  const save = async () => {
    if (!folder) {
      setError("folder is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await dialogsApi.save(folder, seq);
      setSeq(saved);
      setBaseline(saved);
      if (isNew) {
        navigate(
          `/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(saved.Id)}`,
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
    if (isNew || !folder) return;
    const ok = await showConfirm({
      title: `Delete sequence "${seq.Id}"?`,
      message: `Removes ${folder}/${seq.Id}.json from disk.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await dialogsApi.remove(folder, seq.Id);
    navigate(`/dialogs?folder=${encodeURIComponent(folder)}`);
  };

  const backTarget = folder
    ? `/dialogs?folder=${encodeURIComponent(folder)}`
    : "/dialogs";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {isNew ? "New sequence" : seq.Id || "(unnamed)"}
          <DirtyDot dirty={dirty} />
        </h1>
        <div className="flex gap-2">
          <ButtonLink to={backTarget} variant="secondary">
            ← Back{folder ? ` to ${folder}` : ""}
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
            disabled={saving || !seq.Id || !folder}
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
          <span className={fieldLabel}>Folder</span>
          <input
            list="dialog-folders"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={!isNew}
            placeholder="speaker context (e.g. Eddie)"
            className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
          />
          <datalist id="dialog-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={fieldLabel}>Id</span>
          <input
            value={seq.Id}
            onChange={(e) => setSeq({ ...seq, Id: e.target.value })}
            disabled={!isNew}
            placeholder="globally unique sequence id"
            className={`${textInput} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>SourceType</span>
          <select
            value={seq.SourceType}
            onChange={(e) =>
              setSeq({ ...seq, SourceType: e.target.value as DialogSourceType })
            }
            className={textInput}
          >
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block">
          <span className={fieldLabel}>SetsFlag</span>
          <input
            value={seq.SetsFlag}
            onChange={(e) => setSeq({ ...seq, SetsFlag: e.target.value })}
            placeholder="flag set when this sequence begins"
            list={DL.flags}
            className={textInput}
          />
        </label>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
            Lines ({seq.Lines.length})
          </h2>
          <button
            onClick={addLine}
            className={`${button} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`}
          >
            + Line
          </button>
        </div>

        <ol className="space-y-4">
          {seq.Lines.map((line, lineIdx) => (
            <li key={lineIdx} className="rounded border border-neutral-800 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-neutral-500">Line {lineIdx + 1}</span>
                <button
                  onClick={() => removeLine(lineIdx)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove line
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={fieldLabel}>SpeakerName</span>
                  <input
                    value={line.SpeakerName}
                    onChange={(e) =>
                      updateLine(lineIdx, { SpeakerName: e.target.value })
                    }
                    list={DL.npcNames}
                    className={textInput}
                  />
                </label>
                <div className="block">
                  <span className={fieldLabel}>Portrait</span>
                  <div className="mt-1">
                    <AssetPicker
                      path={line.Portrait}
                      onChange={(Portrait) => updateLine(lineIdx, { Portrait })}
                      placeholder="absolute path to portrait image"
                    />
                  </div>
                </div>
                <label className="col-span-2 block">
                  <span className={fieldLabel}>Text</span>
                  <textarea
                    value={line.Text}
                    onChange={(e) => updateLine(lineIdx, { Text: e.target.value })}
                    rows={3}
                    className={`${textInput} font-sans`}
                  />
                </label>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className={fieldLabel}>Choices ({line.Choices.length})</span>
                  <button
                    onClick={() => addChoice(lineIdx)}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    + Choice
                  </button>
                </div>
                {line.Choices.length === 0 ? (
                  <p className="text-xs text-neutral-600">
                    No choices — line falls through to next line in sequence.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {line.Choices.map((choice, choiceIdx) => (
                      <li
                        key={choiceIdx}
                        className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 rounded bg-neutral-900 p-2"
                      >
                        <input
                          value={choice.Text}
                          onChange={(e) =>
                            updateChoice(lineIdx, choiceIdx, { Text: e.target.value })
                          }
                          placeholder="choice text"
                          className={textInput}
                        />
                        <input
                          value={choice.NextSequenceId}
                          onChange={(e) =>
                            updateChoice(lineIdx, choiceIdx, {
                              NextSequenceId: e.target.value,
                            })
                          }
                          placeholder="NextSequenceId"
                          list={DL.sequenceIds}
                          className={textInput}
                        />
                        <input
                          value={choice.SetsFlag}
                          onChange={(e) =>
                            updateChoice(lineIdx, choiceIdx, {
                              SetsFlag: e.target.value,
                            })
                          }
                          placeholder="SetsFlag"
                          list={DL.flags}
                          className={textInput}
                        />
                        <button
                          onClick={() => removeChoice(lineIdx, choiceIdx)}
                          className="self-center text-xs text-red-400 hover:text-red-300"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
