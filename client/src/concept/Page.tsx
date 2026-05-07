import { useEffect, useState } from "react";
import type { Concept } from "@bleepforge/shared";
import { conceptApi, assetUrl } from "../api";
import { AssetPicker } from "../AssetPicker";
import { AssetThumb } from "../AssetThumb";
import { button, fieldLabel, textInput } from "../ui";

// Bleepforge homepage: high-level "what is this game" doc. Single editable
// page. All fields are optional — empty fields just don't render in the
// hero/preview area, so you can fill them gradually as the game's pitch
// crystallizes.

export function ConceptPage() {
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
      const saved = await conceptApi.save(concept);
      setConcept(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Hero — only renders when content is present, so the page reads as
          a real homepage rather than an empty form on first run. */}
      {concept.SplashImage && (
        <img
          src={assetUrl(concept.SplashImage)}
          alt=""
          className="block w-full max-h-72 rounded border border-neutral-800 bg-neutral-950 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      )}

      <header className="flex items-start gap-4">
        {concept.Logo && <AssetThumb path={concept.Logo} size="lg" />}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl tracking-wider text-emerald-300">
            {concept.Title || "Untitled game"}
          </h1>
          {concept.Tagline && (
            <p className="mt-1 text-sm italic text-neutral-300">
              {concept.Tagline}
            </p>
          )}
          {(concept.Genre || concept.Status || concept.Setting) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
              {concept.Genre && (
                <span>
                  <span className="text-neutral-600">Genre:</span>{" "}
                  {concept.Genre}
                </span>
              )}
              {concept.Setting && (
                <span>
                  <span className="text-neutral-600">Setting:</span>{" "}
                  {concept.Setting}
                </span>
              )}
              {concept.Status && (
                <span>
                  <span className="text-neutral-600">Status:</span>{" "}
                  {concept.Status}
                </span>
              )}
            </div>
          )}
        </div>
        {concept.Icon && <AssetThumb path={concept.Icon} size="md" />}
        <button
          onClick={save}
          disabled={saving}
          className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      {concept.Description && (
        <section className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="whitespace-pre-wrap text-sm text-neutral-200">
            {concept.Description}
          </p>
        </section>
      )}

      {/* Editable form. Lives below the hero so the page reads "preview, then
          edit" rather than "edit, then preview". */}
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
              placeholder='e.g. "A robot ARPG where every choice rusts."'
              className={textInput}
            />
          </Field>
          <Field label="Genre">
            <input
              value={concept.Genre}
              onChange={(e) => update({ Genre: e.target.value })}
              placeholder="e.g. ARPG · Top-down · Robot Sim"
              className={textInput}
            />
          </Field>
          <Field label="Setting">
            <input
              value={concept.Setting}
              onChange={(e) => update({ Setting: e.target.value })}
              placeholder="e.g. Post-apocalyptic robot wasteland"
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
          rows={6}
          placeholder="Elevator pitch, tone, what makes this game it…"
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
          <Field label="Splash image" hint="Wide hero image for this page">
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
          rows={4}
          placeholder="Anything else worth keeping at the top of the project."
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
