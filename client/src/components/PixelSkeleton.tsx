interface Props {
  lines?: number;
  className?: string;
}

// Drop-in replacement for the bare-text "Loading…" placeholder that used
// to live inline in every list / edit page. Renders N stacked rectangle
// bars with staggered pulse-opacity animation (see .pixel-skeleton in
// index.css). One element, one animation, no per-context variants:
// list pages render the skeleton in their page area, edit pages do the
// same. The visual feedback is uniform across surfaces, and the bars
// are deliberately rectangular (no border-radius) to match the project-
// wide "pixel-art, no rounded corners" convention.
//
// Accessibility: `role="status"` + `aria-live="polite"` + `aria-busy`
// announce the loading state; the visually-hidden "Loading…" span
// inside gives screen readers an actual word to read.
export function PixelSkeleton({ lines = 3, className = "" }: Props) {
  // Width pattern chosen to feel like "real" text on first impression
  // — a tall first line, fuller second, shorter trailing line. Listed
  // as literal strings so Tailwind's JIT picks them up at build time.
  const widths = ["w-3/4", "w-full", "w-2/3", "w-1/2", "w-5/6"];
  return (
    <div
      className={`pixel-skeleton flex flex-col gap-2 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 ${widths[i % widths.length]} bg-neutral-800`}
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
