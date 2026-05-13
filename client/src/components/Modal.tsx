import { useEffect, useState } from "react";
import { Button } from "./Button";
import { textInput } from "../styles/classes";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
}

export interface ChoiceOption {
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}

export interface ChoiceOptions {
  title: string;
  message?: string;
  /** Array of options shown as a horizontal button row. Order is
   *  display order; the rightmost option is the visual default. */
  options: ChoiceOption[];
}

type Active =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: "choice"; opts: ChoiceOptions; resolve: (v: string | null) => void };

let active: Active | null = null;
const subs = new Set<() => void>();

function notify() {
  for (const fn of subs) fn();
}

function dismissCurrent() {
  if (!active) return;
  if (active.kind === "confirm") active.resolve(false);
  else active.resolve(null);
  active = null;
}

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    dismissCurrent();
    active = { kind: "confirm", opts, resolve };
    notify();
  });
}

export function showPrompt(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    dismissCurrent();
    active = { kind: "prompt", opts, resolve };
    notify();
  });
}

/** Show an N-option chooser dialog. Returns the chosen option's `id`,
 *  or null on dismiss (Escape, backdrop click). Use when a yes/no
 *  confirm doesn't fit because the user needs to pick between 2+
 *  positive actions — e.g. "New theme: from current OR blank" where
 *  both are creating-something paths, just with different starting
 *  points. */
export function showChoice(opts: ChoiceOptions): Promise<string | null> {
  return new Promise((resolve) => {
    dismissCurrent();
    active = { kind: "choice", opts, resolve };
    notify();
  });
}

export function ModalHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const sub = () => force((x) => x + 1);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, []);

  if (!active) return null;
  const a = active;

  const close = (value: boolean | string | null) => {
    active = null;
    if (a.kind === "confirm") a.resolve(value as boolean);
    else a.resolve(value as string | null);
    notify();
  };

  if (a.kind === "confirm") {
    return <ConfirmDialog opts={a.opts} onResult={(v) => close(v)} />;
  }
  if (a.kind === "choice") {
    return <ChoiceDialog opts={a.opts} onResult={(v) => close(v)} />;
  }
  return <PromptDialog opts={a.opts} onResult={(v) => close(v)} />;
}

function Backdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-110 bg-neutral-900 p-5"
      style={{ boxShadow: "4px 4px 0 0 rgba(0,0,0,0.6)" }}
    >
      {children}
    </div>
  );
}

function ConfirmDialog({
  opts,
  onResult,
}: {
  opts: ConfirmOptions;
  onResult: (v: boolean) => void;
}) {
  return (
    <Backdrop onClose={() => onResult(false)}>
      <Card>
        <h2 className="font-display text-sm tracking-wide text-emerald-400">
          {opts.title}
        </h2>
        {opts.message && (
          <p className="mt-3 whitespace-pre-line text-sm text-neutral-200">
            {opts.message}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => onResult(false)}>
            {opts.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            autoFocus
            variant={opts.danger ? "danger" : "primary"}
            onClick={() => onResult(true)}
          >
            {opts.confirmLabel ?? "OK"}
          </Button>
        </div>
      </Card>
    </Backdrop>
  );
}

function ChoiceDialog({
  opts,
  onResult,
}: {
  opts: ChoiceOptions;
  onResult: (v: string | null) => void;
}) {
  return (
    <Backdrop onClose={() => onResult(null)}>
      <Card>
        <h2 className="font-display text-sm tracking-wide text-emerald-400">
          {opts.title}
        </h2>
        {opts.message && (
          <p className="mt-3 whitespace-pre-line text-sm text-neutral-200">
            {opts.message}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => onResult(null)}>
            Cancel
          </Button>
          {opts.options.map((opt, i) => (
            <Button
              key={opt.id}
              autoFocus={i === opts.options.length - 1}
              variant={opt.variant ?? (i === opts.options.length - 1 ? "primary" : "secondary")}
              onClick={() => onResult(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </Card>
    </Backdrop>
  );
}

function PromptDialog({
  opts,
  onResult,
}: {
  opts: PromptOptions;
  onResult: (v: string | null) => void;
}) {
  const [value, setValue] = useState(opts.defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (opts.validate) {
      const err = opts.validate(value);
      if (err) {
        setError(err);
        return;
      }
    }
    onResult(value);
  };

  return (
    <Backdrop onClose={() => onResult(null)}>
      <Card>
        <h2 className="font-display text-sm tracking-wide text-emerald-400">
          {opts.title}
        </h2>
        {opts.message && (
          <p className="mt-3 whitespace-pre-line text-sm text-neutral-300">
            {opts.message}
          </p>
        )}
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onResult(null);
            }
          }}
          placeholder={opts.placeholder}
          className={`${textInput} mt-4 font-mono text-sm`}
        />
        {error && (
          <div className="mt-2 text-xs text-red-400">{error}</div>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => onResult(null)}>
            {opts.cancelLabel ?? "Cancel"}
          </Button>
          <Button onClick={submit}>{opts.confirmLabel ?? "OK"}</Button>
        </div>
      </Card>
    </Backdrop>
  );
}
