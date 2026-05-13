interface Props {
  dirty: boolean;
  className?: string;
}

// Visual cue placed next to an Edit page's title when the buffer
// diverges from the last saved baseline. Pairs with the
// `useUnsavedWarning` hook (which handles the actual guard logic)
// to give the user a same-glance status — dot present + dot absent
// = the source of truth for "do I need to save?"
//
// Standardized as a tiny shared component so every Edit page renders
// the indicator at the same size, color, and placement. Returns null
// when clean so call sites can render it unconditionally:
//
//   <h1>{name} <DirtyDot dirty={dirty} /></h1>
//
// Amber-400 matches the rest of the app's "warning, not error" hue
// (same color the Diagnostics badge uses for warning severity, same
// color the version chip uses in -dev builds). Font-mono so the dot
// renders at consistent size across the 13 body fonts.
export function DirtyDot({ dirty, className = "" }: Props) {
  if (!dirty) return null;
  return (
    <span
      className={`font-mono text-xs text-amber-400 ${className}`}
      title="Unsaved changes"
      aria-label="Unsaved changes"
    >
      ●
    </span>
  );
}
