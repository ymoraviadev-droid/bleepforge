import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Bleepforge's own context menu, pixel-themed. Replaces the browser's default
// menu globally — anywhere the user right-clicks, the browser menu is
// suppressed and one of two things happens:
//
//   1. A component owns that target and wires its own onContextMenu (e.g.
//      sequence nodes in the dialog graph) — they call showContextMenu({...})
//      with their own items and we render those.
//
//   2. The event bubbles to the document and the host's default handler runs.
//      The default handler builds Cut / Copy / Paste items based on the
//      current selection + whether the target is editable. If no item
//      applies, no menu appears (right-click becomes a no-op).
//
// API mirrors Modal.tsx: imperative show/hide via a module singleton + pub/sub.
//
// ── Tauri-readiness notes (for the desktop build):
//
//   • Tauri's webview shows the OS context menu on right-click in some configs.
//     Bind `tauri.conf.json` to disable it at the window level — our preventDefault
//     gets us most of the way but the OS one can still flash on some platforms.
//
//   • Clipboard: today we use the browser Clipboard API with execCommand
//     fallback. In Tauri it works, but `@tauri-apps/plugin-clipboard-manager`
//     is more bulletproof (no permission prompts). Swap the read/write calls
//     in buildDefaultItems when we move to Tauri.
//
//   • For now the HTML menu stays — porting to Tauri's native Menu API would
//     give a more OS-native feel but loses the pixel theme, which is its
//     whole point.

export interface ContextMenuItem {
  label: string;
  // Optional shortcut hint shown right-aligned (e.g. "⌘C"). Display only.
  shortcut?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
}

export interface ContextMenuOptions {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

type Active = ContextMenuOptions | null;

let active: Active = null;
const subs = new Set<() => void>();

function notify() {
  for (const fn of subs) fn();
}

export function showContextMenu(opts: ContextMenuOptions): void {
  if (opts.items.length === 0) {
    // Nothing to show — make sure any prior menu is dismissed and bail.
    active = null;
    notify();
    return;
  }
  active = opts;
  notify();
}

export function hideContextMenu(): void {
  if (!active) return;
  active = null;
  notify();
}

// ---- Default text-aware handler (Cut / Copy / Paste) ----------------------

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "INPUT") {
    const t = (target as HTMLInputElement).type.toLowerCase();
    // Only text-y inputs accept paste in a meaningful way.
    return ["text", "search", "url", "email", "password", "tel", "number", "date"].includes(t);
  }
  if (target.tagName === "TEXTAREA") return true;
  return false;
}

function buildDefaultItems(target: EventTarget | null): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const sel = window.getSelection?.()?.toString() ?? "";
  const editable = isEditable(target);
  const hasSelection = sel.length > 0;

  if (editable && hasSelection) {
    items.push({
      label: "Cut",
      shortcut: "Ctrl+X",
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(sel);
        } catch {}
        // Fallback also fires the browser's cut path so the input updates.
        document.execCommand("cut");
      },
    });
  }
  if (hasSelection) {
    items.push({
      label: "Copy",
      shortcut: "Ctrl+C",
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(sel);
        } catch {
          document.execCommand("copy");
        }
      },
    });
  }
  if (editable) {
    items.push({
      label: "Paste",
      shortcut: "Ctrl+V",
      onClick: async () => {
        // Try the modern API first; fall back to execCommand for older
        // browsers / restricted permission contexts.
        try {
          const text = await navigator.clipboard.readText();
          if (text) insertAtCursor(target, text);
        } catch {
          document.execCommand("paste");
        }
      },
    });
  }
  return items;
}

function insertAtCursor(el: HTMLElement, text: string) {
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.substring(0, start);
    const after = input.value.substring(end);
    // Use the native setter so React's onChange fires (otherwise the value
    // won't be picked up by controlled components).
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(input, before + text + after);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const caret = start + text.length;
    input.setSelectionRange(caret, caret);
  } else if (el.isContentEditable) {
    document.execCommand("insertText", false, text);
  }
}

// ---- Host -----------------------------------------------------------------

const MENU_PADDING = 4;

export function ContextMenuHost() {
  const [, force] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Adjusted position after measuring — keeps the menu inside the viewport.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const sub = () => force((x) => x + 1);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, []);

  // Default handler — runs when no component caught + handled the contextmenu.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // If a downstream handler called preventDefault but didn't stopPropagation,
      // we still see the event but defaultPrevented is true. Skip in that case;
      // they took care of it.
      if (e.defaultPrevented) return;
      e.preventDefault();
      const items = buildDefaultItems(e.target);
      showContextMenu({ x: e.clientX, y: e.clientY, items });
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  // Dismiss on click outside, Escape, scroll, resize. Listeners use the
  // capture phase so handlers further down the tree (notably React Flow's
  // pane, which stops mousedown propagation for its own pan/zoom) can't
  // swallow them — without `true` on mousedown the click-outside dismiss
  // silently fails on the dialog graph.
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideContextMenu();
    };
    const onScroll = () => hideContextMenu();
    document.addEventListener("mousedown", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  });

  // Reset measurement state when a new menu request comes in, then measure
  // and clamp to viewport. When the cursor is in the bottom 30% of the
  // viewport, anchor the menu by its bottom edge so it opens *upward* —
  // matches native OS context menu behavior and means right-clicking near
  // the bottom never produces a clipped menu.
  useLayoutEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) {
      setPos({ x: active.x, y: active.y });
      return;
    }
    const rect = el.getBoundingClientRect();
    let x = active.x;
    const flipUp = active.y > window.innerHeight * 0.7;
    let y = flipUp ? active.y - rect.height : active.y;

    if (x + rect.width + MENU_PADDING > window.innerWidth) {
      x = Math.max(MENU_PADDING, window.innerWidth - rect.width - MENU_PADDING);
    }
    if (y + rect.height + MENU_PADDING > window.innerHeight) {
      y = Math.max(MENU_PADDING, window.innerHeight - rect.height - MENU_PADDING);
    }
    if (y < MENU_PADDING) y = MENU_PADDING;
    setPos({ x, y });
  }, [active]);

  if (!active) return null;
  const { items } = active;
  const renderPos = pos ?? { x: active.x, y: active.y };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-60 min-w-44 border-2 border-neutral-700 bg-neutral-900 py-1 font-mono text-xs text-neutral-100 shadow-[3px_3px_0_0_rgba(0,0,0,0.6)]"
      // Hide while measuring to avoid flicker; opacity → 1 once `pos` is set.
      style={{
        left: renderPos.x,
        top: renderPos.y,
        opacity: pos ? 1 : 0,
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={async () => {
            hideContextMenu();
            try {
              await item.onClick();
            } catch (err) {
              console.error("[context-menu] item action failed:", err);
            }
          }}
          className={`flex w-full items-center justify-between gap-4 px-3 py-1 text-left transition-colors ${
            item.disabled
              ? "cursor-not-allowed text-neutral-600"
              : item.danger
                ? "text-red-400 hover:bg-red-950/40 hover:text-red-200"
                : "hover:bg-emerald-950/40 hover:text-emerald-200"
          }`}
        >
          <span>{item.label}</span>
          {item.shortcut && (
            <span className="text-[10px] text-neutral-500">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );
}
