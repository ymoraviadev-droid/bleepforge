import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { HelpCategoryMeta, HelpEntry } from "@bleepforge/shared";
import { helpApi } from "../../lib/api";
import { useDevMode } from "../../lib/useDevMode";
import { Button, ButtonLink } from "../../components/Button";
import { showConfirm } from "../../components/Modal";
import { NotFoundPage } from "../../components/NotFoundPage";
import { fieldLabel, textInput } from "../../styles/classes";
import { paletteColorClasses } from "../../lib/paletteColor";
import { dispatchHelpChanged } from "./HelpLayout";
import { RenderHelpBody } from "./render";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

const empty = (): HelpEntry => ({
  Id: "",
  Title: "",
  Section: "",
  Summary: "",
  Body: "",
  Order: 0,
  Tags: [],
  UpdatedAt: "",
});

// Help-entry editor. Live-preview pane on the right runs the same
// renderer the view page uses. Dev-mode-gated: when BLEEPFORGE_DEV_MODE
// is unset, the form returns the 404 fallback.

export function EntryEdit() {
  const { category, id } = useParams();
  const navigate = useNavigate();
  const isNew = id === undefined;
  const devMode = useDevMode();

  const [meta, setMeta] = useState<HelpCategoryMeta | null>(null);
  const [entry, setEntry] = useState<HelpEntry>(empty());
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingSections, setExistingSections] = useState<string[]>([]);

  useEffect(() => {
    if (!category) return;
    helpApi
      .getMeta(category)
      .then((m) => (m === null ? setError("not found") : setMeta(m)))
      .catch((e) => setError(String(e)));
    helpApi
      .listInCategory(category)
      .then((entries) => {
        const sections = [...new Set(entries.map((e) => e.Section).filter(Boolean))].sort();
        setExistingSections(sections);
      })
      .catch(() => setExistingSections([]));
  }, [category]);

  useEffect(() => {
    if (isNew || !category || !id) return;
    helpApi
      .getEntry(category, id)
      .then((e) => {
        if (e === null) setError("not found");
        else {
          setEntry(e);
          setLoaded(true);
        }
      })
      .catch((e) => setError(String(e)));
  }, [category, id, isNew]);

  const sectionListId = useMemo(
    () => (category ? `help-sections-${category}` : "help-sections"),
    [category],
  );

  if (!devMode) return <NotFoundPage />;
  if (error === "not found") return <NotFoundPage />;
  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (!meta || !loaded || !category)
    return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<HelpEntry>) => setEntry({ ...entry, ...partial });

  const canSave = NAME_RE.test(entry.Id) && entry.Id !== "_meta" && entry.Id !== "_layout";

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await helpApi.saveEntry(category, entry);
      dispatchHelpChanged();
      if (isNew) {
        navigate(
          `/help/${encodeURIComponent(category)}/${encodeURIComponent(saved.Id)}`,
          { replace: true },
        );
      } else {
        navigate(
          `/help/${encodeURIComponent(category)}/${encodeURIComponent(saved.Id)}`,
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew || !id) return;
    const ok = await showConfirm({
      title: `Delete entry "${entry.Title || entry.Id}"?`,
      message: "Removes the JSON file from disk. Cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await helpApi.removeEntry(category, id);
    dispatchHelpChanged();
    navigate(`/help/${encodeURIComponent(category)}`);
  };

  const colors = paletteColorClasses(meta.Color);
  const categoryDisplay = meta.DisplayName || category;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link to="/help" className="text-neutral-400 hover:text-neutral-200">
            Help
          </Link>
          <span className="text-neutral-600">/</span>
          <Link
            to={`/help/${encodeURIComponent(category)}`}
            className={`hover:underline ${colors.text}`}
          >
            {categoryDisplay}
          </Link>
          <span className="text-neutral-600">/</span>
          <span>{isNew ? "New entry" : entry.Title || entry.Id}</span>
        </h1>
        <div className="flex gap-2">
          <ButtonLink
            to={
              isNew
                ? `/help/${encodeURIComponent(category)}`
                : `/help/${encodeURIComponent(category)}/${encodeURIComponent(entry.Id)}`
            }
            variant="secondary"
          >
            ← Back
          </ButtonLink>
          {!isNew && (
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          )}
          <Button onClick={save} disabled={saving || !canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <datalist id={sectionListId}>
        {existingSections.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-3 border-2 border-neutral-800 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabel}>Id</span>
              <input
                value={entry.Id}
                onChange={(e) => update({ Id: e.target.value })}
                disabled={!isNew}
                placeholder="e.g. first-save"
                className={`${textInput} font-mono disabled:cursor-not-allowed disabled:opacity-60`}
              />
              <span className="mt-1 block text-[10px] text-neutral-600">
                Filename basename. Locked once saved.
              </span>
            </label>
            <label className="block">
              <span className={fieldLabel}>Title</span>
              <input
                value={entry.Title}
                onChange={(e) => update({ Title: e.target.value })}
                placeholder="What this entry covers"
                className={textInput}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabel}>Section</span>
              <input
                value={entry.Section}
                onChange={(e) => update({ Section: e.target.value })}
                list={sectionListId}
                placeholder="optional grouping label"
                className={textInput}
              />
              <span className="mt-1 block text-[10px] text-neutral-600">
                Free-form. Entries with the same Section group together on the
                category page. Leave blank for an unsectioned entry.
              </span>
            </label>
            <label className="block">
              <span className={fieldLabel}>Order</span>
              <input
                type="number"
                value={entry.Order}
                onChange={(e) => update({ Order: Number(e.target.value) || 0 })}
                className={`${textInput} font-mono`}
              />
              <span className="mt-1 block text-[10px] text-neutral-600">
                Sort key within the section. Lower numbers first.
              </span>
            </label>
          </div>
          <label className="block">
            <span className={fieldLabel}>Summary</span>
            <input
              value={entry.Summary}
              onChange={(e) => update({ Summary: e.target.value })}
              placeholder="One or two lines shown under the title and in search."
              className={textInput}
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Body</span>
            <textarea
              value={entry.Body}
              onChange={(e) => update({ Body: e.target.value })}
              rows={24}
              placeholder={SAMPLE_HINT}
              spellCheck={true}
              className={`${textInput} font-mono text-xs leading-relaxed`}
            />
            <span className="mt-1 block text-[10px] text-neutral-600">
              Markdown subset: ## h2, ### h3, paragraphs, - bullets, 1. ordered
              lists, `inline code`, ```fenced code```, &gt; note: callouts (also
              tip:, warn:), [label](/route) links, :kbd[Ctrl+K] chips.
            </span>
          </label>
        </section>

        <section className="space-y-3 border-2 border-neutral-800 bg-neutral-950/40 p-4">
          <h2 className="font-display text-xs uppercase tracking-wider text-neutral-400">
            Live preview
          </h2>
          <div className="border-t-2 border-neutral-900 pt-3">
            {entry.Body ? (
              <RenderHelpBody body={entry.Body} />
            ) : (
              <p className="text-xs italic text-neutral-600">
                Start typing in the Body field. Preview renders here.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const SAMPLE_HINT = `## Heading

A short paragraph.

- bullet
- another bullet

> tip: a tip callout.

\`\`\`
code block
\`\`\`

[Link to dialogs](/dialogs)  press :kbd[Ctrl+K] to search.`;
