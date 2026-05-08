import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Concept } from "@bleepforge/shared";
import { conceptApi } from "../lib/api";
import { AssetPicker } from "../components/AssetPicker";
import { ButtonLink } from "../components/Button";
import { button, fieldLabel, textInput } from "../styles/classes";

// Edit form for the singleton concept doc. After save, navigate back to the
// /concept view so the user sees the result. Cancel = same.

export function ConceptEdit() {
  const navigate = useNavigate();
  const [concept, setConcept] = useState<Concept | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    conceptApi.get().then(setConcept).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (concept === null)
    return <div className="text-neutral-500">Loading…</div>;

  const update = (partial: Partial<Concept>) =>
    setConcept({ ...concept, ...partial });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await conceptApi.save(concept);
      navigate("/concept");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit game concept</h1>
        <div className="flex gap-2">
          <ButtonLink to="/concept" variant="secondary">
            ← Cancel
          </ButtonLink>
          <button
            onClick={save}
            disabled={saving}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <Section title="Identity">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title">
            <input
              value={concept.Title}
              onChange={(e) => update({ Title: e.target.value })}
              placeholder="e.g. Flock of Bleeps"
              className={textInput}
            />
          </Field>
          <Field label="Tagline" hint="One-line pitch">
            <input
              value={concept.Tagline}
              onChange={(e) => update({ Tagline: e.target.value })}
              placeholder='e.g. "You’re the only one who showed up."'
              className={textInput}
            />
          </Field>
          <Field label="Genre">
            <input
              value={concept.Genre}
              onChange={(e) => update({ Genre: e.target.value })}
              placeholder="e.g. 2D side-scroller · adventure-platformer · light RPG"
              className={textInput}
            />
          </Field>
          <Field label="Setting">
            <input
              value={concept.Setting}
              onChange={(e) => update({ Setting: e.target.value })}
              placeholder="e.g. Far-future Earth — robots run everything"
              className={textInput}
            />
          </Field>
          <Field label="Status">
            <input
              value={concept.Status}
              onChange={(e) => update({ Status: e.target.value })}
              placeholder="e.g. Prototype · In development · Released"
              className={textInput}
            />
          </Field>
        </div>
      </Section>

      <Section title="Description">
        <textarea
          value={concept.Description}
          onChange={(e) => update({ Description: e.target.value })}
          rows={8}
          placeholder="Elevator pitch, premise, tone, what makes this game it…"
          className={textInput}
        />
      </Section>

      <Section title="Art">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Logo" hint="Brand mark — usually square-ish">
            <AssetPicker
              path={concept.Logo}
              onChange={(Logo) => update({ Logo })}
              placeholder="absolute path to logo"
            />
          </Field>
          <Field label="Icon" hint="Small icon (favicon-ish)">
            <AssetPicker
              path={concept.Icon}
              onChange={(Icon) => update({ Icon })}
              placeholder="absolute path to icon"
            />
          </Field>
          <Field label="Splash image" hint="Wide hero image for /concept">
            <AssetPicker
              path={concept.SplashImage}
              onChange={(SplashImage) => update({ SplashImage })}
              placeholder="absolute path to splash image"
            />
          </Field>
        </div>
      </Section>

      <Section title="Inspirations">
        <textarea
          value={concept.Inspirations}
          onChange={(e) => update({ Inspirations: e.target.value })}
          rows={4}
          placeholder="Games / films / books that shape the vibe — one per line."
          className={textInput}
        />
      </Section>

      <Section title="Notes">
        <textarea
          value={concept.Notes}
          onChange={(e) => update({ Notes: e.target.value })}
          rows={10}
          placeholder="Anything else — acts, factions, system specifics, scratch."
          className={textInput}
        />
      </Section>
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
