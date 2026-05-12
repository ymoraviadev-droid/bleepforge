import { useEffect, useRef } from "react";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentUnit } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";

import { gdshaderExtension } from "./gdshaderLang";

// CodeMirror 6 wrapper for GDShader editing. Stays uncontrolled in the
// React sense — the editor owns its doc state and pushes changes up via
// onChange. External value changes (e.g. file reloaded after watcher
// event) flow back via a doc-replacement transaction. The lifecycle is:
//
//   mount: build EditorView with our extensions
//   typing: update listener fires onChange; parent updates `value`;
//           the prop-comparison effect sees value matches the doc, no-op
//   external change: parent updates `value` to a fresh string; the
//           prop-comparison effect dispatches a transaction that
//           replaces the doc; flag stops onChange from re-firing for
//           the reset
//
// This is the standard CM6-in-React pattern. A controlled approach
// (every keystroke round-trips through React state) would cause cursor
// jumps + IME composition issues; the uncontrolled-with-resync pattern
// is what most CM6 React libraries (react-codemirror2, @uiw/react-codemirror)
// implement under the hood, just open-coded here so we avoid yet another
// dependency for a single use site.

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, onSave, readOnly }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  // True while we're applying an external value-prop reset — stops the
  // updateListener from re-firing onChange for our own doc replacement.
  const isExternalUpdateRef = useRef(false);
  // Compartment for the readOnly facet so we can toggle it at runtime
  // without rebuilding the editor (which would lose scroll, selection,
  // and history). Stable across renders via useRef.
  const readOnlyCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Build the editor once on mount. We deliberately don't list `value` in
  // the deps — the value prop flows in via the second effect below, which
  // dispatches a transaction without rebuilding the view (preserves
  // history, scroll position, cursor, selection).
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      bracketMatching(),
      indentUnit.of("    "), // 4-space indent matches Godot's convention
      gdshaderExtension(),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.lineWrapping,
      EditorView.theme(THEME, { dark: true }),
      readOnlyCompartmentRef.current.of(EditorState.readOnly.of(!!readOnly)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (isExternalUpdateRef.current) return;
        onChangeRef.current(update.state.doc.toString());
      }),
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resync from external value changes. Comparing against the current
  // doc avoids a cursor-jumping no-op transaction when the parent
  // re-renders without changing the value (very common in React).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    isExternalUpdateRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
    isExternalUpdateRef.current = false;
  }, [value]);

  // Toggle read-only when the prop changes without rebuilding the view.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(
        EditorState.readOnly.of(!!readOnly),
      ),
    });
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      className="bleepforge-codemirror"
      style={{ height: "100%" }}
    />
  );
}

// CodeMirror theme — Bleepforge's pixel/CRT vibe. Resolves through the
// CSS variables Tailwind exposes (the global theme system re-points
// these, so the editor retints with the rest of the app). Fixed-width
// font; line-height matches the existing source `<pre>` block from
// Phase 1 so swapping in the editor doesn't shift the visual baseline.
const THEME = {
  "&": {
    color: "var(--color-neutral-200)",
    backgroundColor: "var(--color-neutral-950)",
    height: "100%",
    fontSize: "13px",
  },
  ".cm-content": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    caretColor: "var(--color-emerald-400)",
    padding: "0.5rem 0",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    lineHeight: "1.5",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-neutral-950)",
    color: "var(--color-neutral-600)",
    borderRight: "1px solid var(--color-neutral-800)",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--color-neutral-900)",
    color: "var(--color-emerald-400)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--color-neutral-900)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--color-emerald-900) !important",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-emerald-400)",
    borderLeftWidth: "2px",
  },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    backgroundColor: "var(--color-emerald-950)",
    color: "var(--color-emerald-300)",
  },
} as const;
