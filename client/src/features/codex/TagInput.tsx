import { useState, type KeyboardEvent } from "react";
import { textInput } from "../../styles/classes";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Datalist id for autocomplete (e.g. DL.flags). Optional. */
  listId?: string;
}

// Chip-input for Codex "tags" property type. Comma or Enter commits the
// current draft as a tag; Backspace on empty draft removes the last chip.
// Tags are unique per entry (a duplicate add is a no-op) and trimmed.

export function TagInput({ value, onChange, placeholder, listId }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const removeAt = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  };

  return (
    <div
      className={`${textInput} flex flex-wrap items-center gap-1.5 py-1.5`}
      onClick={(e) => {
        // Click anywhere in the field focuses the inner input — feels right
        // when the chips fill most of the visible area.
        const target = e.currentTarget.querySelector("input");
        target?.focus();
      }}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 border border-emerald-700/60 bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeAt(i);
            }}
            className="text-emerald-400/70 hover:text-emerald-200"
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? placeholder : ""}
        list={listId}
        className="min-w-24 flex-1 bg-transparent font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600"
      />
    </div>
  );
}
