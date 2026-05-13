import { Button } from "./Button";

// Banner shown when the watcher reports that the file backing this edit
// form was modified (or removed) on disk while the user has unsaved
// local edits. Lets the user choose: keep editing (their save will
// resolve the conflict in their favor) or reload from disk (unsaved
// work is discarded).
//
// Used across all seven game-domain edit pages and the shader edit
// page. Same kind/onReload/onDismiss shape as the original shader
// inline copy — extracted so the seven domains can mirror the
// behavior without each carrying its own JSX.

export type ExternalChangeKind = "changed" | "removed";

interface Props {
  kind: ExternalChangeKind;
  onReload: () => void;
  onDismiss: () => void;
  /** Override the default "modified externally" copy for cases where the
   *  default text doesn't fit. Optional. */
  message?: string;
}

export function ExternalChangeBanner({
  kind,
  onReload,
  onDismiss,
  message,
}: Props) {
  if (kind === "removed") {
    return (
      <div className="flex items-center justify-between gap-3 border-2 border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">
        <span>
          {message ??
            "This entity was deleted on disk. Your form still has the last-known values; save to recreate it, or navigate away."}
        </span>
        <Button onClick={onDismiss} variant="secondary" size="sm">
          Dismiss
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 border-2 border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
      <span>
        {message ??
          "Modified externally while you had unsaved edits. Save to overwrite their changes, or reload to discard yours."}
      </span>
      <div className="flex gap-2">
        <Button onClick={onReload} variant="secondary" size="sm">
          Reload from disk
        </Button>
        <Button onClick={onDismiss} variant="secondary" size="sm">
          Keep editing
        </Button>
      </div>
    </div>
  );
}
