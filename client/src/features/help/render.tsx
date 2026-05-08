import { Link } from "react-router";
import type { ReactNode } from "react";

// Help-body renderer. Parses a tight markdown subset and emits themed
// React components.
//
// Supported syntax:
//   ## Heading        h2 (theme accent color)
//   ### Subheading    h3 (neutral 200, smaller)
//   plain paragraphs separated by a blank line
//   - bullet item     unordered list
//   1. ordered item   ordered list (any leading digits + dot)
//   `inline code`     monospace span on a darkened background
//   ```fenced```      multi-line code block
//   > note: text      callout in a neutral border (kinds: note, tip, warn)
//   [text](/route)    Router Link if href starts with "/", else <a target=_blank>
//   :kbd[Ctrl+K]      keyboard chip
//
// Why hand-rolled instead of a markdown library: every visual surface
// gets its own pixel-themed component (callouts have a small chip
// label, kbd chips have a recessed border, code blocks use the same
// scrollbar styling as the rest of the app), and a markdown library
// would still need a custom plugin layer to map element to component.
// The parser is small enough to read top-to-bottom.

export interface RenderHelpBodyProps {
  body: string;
}

export function RenderHelpBody({ body }: RenderHelpBodyProps): ReactNode {
  const blocks = parseBlocks(body);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-neutral-300">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

// Block types. The parser is two passes: first a line-walker that
// folds lines into blocks (paragraphs, lists, fenced code, callouts),
// then per-block inline parsing for code, links, and kbd chips.
type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string; content: string }
  | { kind: "callout"; tone: "note" | "tip" | "warn"; text: string };

function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  const at = (idx: number): string => lines[idx] ?? "";

  while (i < lines.length) {
    const line = at(i);

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !at(i).startsWith("```")) {
        buf.push(at(i));
        i++;
      }
      // Skip the closing fence if present; tolerate a missing one (don't
      // hang on malformed input).
      if (i < lines.length) i++;
      out.push({ kind: "code", lang, content: buf.join("\n") });
      continue;
    }

    if (line.startsWith("## ")) {
      out.push({ kind: "h2", text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push({ kind: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }

    const calloutMatch = /^>\s*(note|tip|warn):\s*(.*)$/i.exec(line);
    if (calloutMatch) {
      const tone = (calloutMatch[1] ?? "note").toLowerCase() as
        | "note"
        | "tip"
        | "warn";
      const buf: string[] = [calloutMatch[2] ?? ""];
      i++;
      while (i < lines.length && at(i).startsWith(">")) {
        buf.push(at(i).replace(/^>\s?/, ""));
        i++;
      }
      out.push({ kind: "callout", tone, text: buf.join(" ").trim() });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(at(i))) {
        items.push(at(i).replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push({ kind: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(at(i))) {
        items.push(at(i).replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push({ kind: "ol", items });
      continue;
    }

    // Default: paragraph. Glob consecutive non-empty, non-special lines
    // into one paragraph so authors can hard-wrap source lines without
    // forcing a visual line break.
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const peek = at(i);
      if (
        !peek.trim() ||
        peek.startsWith("## ") ||
        peek.startsWith("### ") ||
        peek.startsWith("```") ||
        /^>\s*(note|tip|warn):/i.test(peek) ||
        /^[-*]\s+/.test(peek) ||
        /^\d+\.\s+/.test(peek)
      ) {
        break;
      }
      buf.push(peek);
      i++;
    }
    out.push({ kind: "p", text: buf.join(" ") });
  }

  return out;
}

function renderBlock(block: Block, idx: number): ReactNode {
  switch (block.kind) {
    case "h2":
      return (
        <h2
          key={idx}
          className="font-display text-sm uppercase tracking-wider text-emerald-300"
        >
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={idx}
          className="text-sm font-semibold uppercase tracking-wide text-neutral-200"
        >
          {block.text}
        </h3>
      );
    case "p":
      return (
        <p key={idx} className="text-neutral-300">
          {renderInline(block.text)}
        </p>
      );
    case "ul":
      return (
        <ul key={idx} className="list-disc space-y-1 pl-5 marker:text-neutral-600">
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol
          key={idx}
          className="list-decimal space-y-1 pl-5 marker:text-neutral-600"
        >
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre
          key={idx}
          className="overflow-x-auto border-2 border-neutral-800 bg-neutral-950 p-3 font-mono text-xs leading-relaxed text-neutral-200"
        >
          <code>{block.content}</code>
        </pre>
      );
    case "callout":
      return <Callout key={idx} tone={block.tone} text={block.text} />;
  }
}

interface CalloutProps {
  tone: "note" | "tip" | "warn";
  text: string;
}

function Callout({ tone, text }: CalloutProps): ReactNode {
  const palette =
    tone === "warn"
      ? {
          border: "border-amber-700/60",
          bg: "bg-amber-950/30",
          chip: "bg-amber-700/70 text-amber-100",
          label: "WARN",
        }
      : tone === "tip"
      ? {
          border: "border-emerald-700/60",
          bg: "bg-emerald-950/30",
          chip: "bg-emerald-700/70 text-emerald-100",
          label: "TIP",
        }
      : {
          border: "border-neutral-700",
          bg: "bg-neutral-900/60",
          chip: "bg-neutral-700 text-neutral-100",
          label: "NOTE",
        };
  return (
    <div className={`flex gap-3 border-2 ${palette.border} ${palette.bg} p-3`}>
      <span
        className={`shrink-0 self-start px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${palette.chip}`}
      >
        {palette.label}
      </span>
      <div className="text-sm text-neutral-200">{renderInline(text)}</div>
    </div>
  );
}

// Inline renderer. Walks the string left-to-right; each iteration finds
// the earliest match of any inline form and slices around it.
function renderInline(input: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const push = (node: ReactNode) => {
    out.push(<span key={key++}>{node}</span>);
  };

  while (i < input.length) {
    const ch = input[i];

    // Inline code: `...`. Earliest priority because backticks shouldn't
    // tokenize as anything else.
    if (ch === "`") {
      const close = input.indexOf("`", i + 1);
      if (close > i) {
        push(
          <code className="border border-neutral-800 bg-neutral-900 px-1 font-mono text-xs text-neutral-200">
            {input.slice(i + 1, close)}
          </code>,
        );
        i = close + 1;
        continue;
      }
    }

    // Keyboard chip :kbd[Ctrl+K]
    if (input.startsWith(":kbd[", i)) {
      const close = input.indexOf("]", i + 5);
      if (close > i) {
        push(<KbdChip text={input.slice(i + 5, close)} />);
        i = close + 1;
        continue;
      }
    }

    // Link [label](href)
    if (ch === "[") {
      const closeBracket = input.indexOf("]", i + 1);
      if (closeBracket > i && input[closeBracket + 1] === "(") {
        const closeParen = input.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket) {
          const label = input.slice(i + 1, closeBracket);
          const href = input.slice(closeBracket + 2, closeParen);
          push(<HelpLink label={label} href={href} />);
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Plain run: read until the next special char.
    let next = input.length;
    for (const sentinel of ["`", "[", ":"]) {
      const where = input.indexOf(sentinel, i);
      if (where !== -1 && where < next) next = where;
    }
    if (next === i) {
      // Special char that didn't form a complete construct; emit it as
      // literal and step forward to avoid an infinite loop.
      out.push(ch ?? "");
      i++;
    } else {
      out.push(input.slice(i, next));
      i = next;
    }
  }

  return out;
}

function KbdChip({ text }: { text: string }) {
  return (
    <kbd className="mx-0.5 inline-flex items-center border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
      {text}
    </kbd>
  );
}

function HelpLink({ label, href }: { label: string; href: string }) {
  // Internal links use the router; external links open in a new tab so
  // the help session isn't lost when someone clicks through.
  if (href.startsWith("/")) {
    return (
      <Link to={href} className="text-emerald-300 underline hover:text-emerald-200">
        {label}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-emerald-300 underline hover:text-emerald-200"
    >
      {label}
    </a>
  );
}
