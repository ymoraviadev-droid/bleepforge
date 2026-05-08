import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Concept } from "@bleepforge/shared";
import { conceptApi, assetUrl } from "../../lib/api";
import { AssetThumb } from "../../components/AssetThumb";
import {
  BannerPlaceholder,
  IconPlaceholder,
  LogoPlaceholder,
} from "../../components/PixelPlaceholder";
import { button } from "../../styles/classes";

// Read-only homepage view of the concept doc. The "Edit" button takes you to
// /concept/edit. Mirrors the items/quests pattern (list = preview-ish, edit
// = form), except this is a singleton so the "list" is the full page.

export function ConceptView() {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    conceptApi.get().then(setConcept).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (concept === null)
    return <div className="text-neutral-500">Loading…</div>;

  const hasMeta = concept.Genre || concept.Setting || concept.Status;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Hero — splash image (or placeholder) sets the page mood. */}
      {concept.SplashImage ? (
        <img
          src={assetUrl(concept.SplashImage)}
          alt=""
          className="block w-full max-h-72 rounded border border-neutral-800 bg-neutral-950 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <BannerPlaceholder
          className="h-48 w-full"
          title="No splash image yet — click Edit to add one"
        />
      )}

      <header className="flex items-start gap-4">
        {concept.Logo ? (
          <AssetThumb path={concept.Logo} size="lg" />
        ) : (
          <LogoPlaceholder className="size-24" title="No logo yet" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl tracking-wider text-emerald-300">
            {concept.Title || (
              <span className="italic font-normal text-neutral-500">
                Untitled game
              </span>
            )}
          </h1>
          {concept.Tagline && (
            <p className="mt-2 text-base italic text-neutral-300">
              {concept.Tagline}
            </p>
          )}
          {hasMeta && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
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
        <div className="flex flex-col items-center gap-2">
          {concept.Icon ? (
            <AssetThumb path={concept.Icon} size="md" />
          ) : (
            <IconPlaceholder className="size-14" title="No icon yet" />
          )}
          <Link
            to="/concept/edit"
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            Edit
          </Link>
        </div>
      </header>

      {concept.Description && (
        <ReadSection title="Description">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
            {concept.Description}
          </p>
        </ReadSection>
      )}

      {concept.Inspirations && (
        <ReadSection title="Inspirations">
          <p className="whitespace-pre-wrap text-sm text-neutral-300">
            {concept.Inspirations}
          </p>
        </ReadSection>
      )}

      {concept.Notes && (
        <ReadSection title="Notes">
          <p className="whitespace-pre-wrap text-sm text-neutral-300">
            {concept.Notes}
          </p>
        </ReadSection>
      )}

      {!concept.Description && !concept.Inspirations && !concept.Notes && (
        <div className="rounded border-2 border-dashed border-neutral-800 bg-neutral-900/30 p-8 text-center text-sm text-neutral-500">
          Nothing written yet — hit{" "}
          <Link to="/concept/edit" className="text-emerald-400 hover:text-emerald-300">
            Edit
          </Link>{" "}
          to start.
        </div>
      )}
    </div>
  );
}

function ReadSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="font-display text-xs tracking-wider text-emerald-400">
        {title.toUpperCase()}
      </h2>
      {children}
    </section>
  );
}
