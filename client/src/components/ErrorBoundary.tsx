// App-level error boundary. Catches any render error in the route tree and
// shows a pixel-themed fallback page instead of letting React unmount the
// shell to a white screen. Click "Reload" to retry; "Go home" to navigate
// to /concept (which lives outside any failing subtree). The technical
// details are collapsed by default — most users don't care, but having the
// stack one click away is useful when reporting bugs.

import {
  Component,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";
import { Button, ButtonLink } from "./Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console so the Diagnostics → Logs tab captures it via the
    // server-side console interception (errors thrown client-side won't
    // make it there, but at least devtools shows the full trace).
    console.error("ErrorBoundary caught:", error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  reset = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  reload = (): void => {
    window.location.reload();
  };

  copyToClipboard = async (): Promise<void> => {
    const { error, componentStack } = this.state;
    if (!error) return;
    const text = [
      `Error: ${error.message}`,
      "",
      "Stack:",
      error.stack ?? "(no stack)",
      "",
      "Component stack:",
      componentStack ?? "(no component stack)",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Best-effort. If the clipboard API rejects (rare in a desktop shell),
      // silently fail — the details are visible in the <details> below
      // either way, so the user can copy manually.
    }
  };

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="text-red-400/80">
          <BrokenRobot className="size-32" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-base uppercase tracking-wider text-red-300">
            This robot is fritzing
          </h1>
          <p className="text-xs text-neutral-400">
            Something broke while rendering this page. Your data is safe — it
            lives on disk, not in the page state.
          </p>
        </div>
        <div className="max-w-md rounded border-2 border-red-900/60 bg-red-950/30 px-3 py-2 text-left">
          <code className="block wrap-break-word font-mono text-[11px] text-red-200">
            {error.message || error.name || "Unknown error"}
          </code>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={this.reload}>
            Reload page
          </Button>
          <ButtonLink to="/concept" size="sm" variant="secondary" onClick={this.reset}>
            Go home
          </ButtonLink>
          <Button size="sm" variant="ghost" onClick={this.copyToClipboard}>
            Copy error
          </Button>
        </div>
        <details className="w-full max-w-2xl text-left">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-300">
            Technical details
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded border border-neutral-800 bg-neutral-950 p-3 font-mono text-[10px] text-neutral-400">
            {error.stack || "(no stack trace)"}
            {componentStack && `\n\nComponent stack:${componentStack}`}
          </pre>
        </details>
      </div>
    );
  }
}

interface IllustrationProps {
  className?: string;
  title?: string;
}

// 24x24 — robot head, but broken. Antenna snapped at the base, pieces
// scattered. X eyes, a vertical crack down the forehead, a few sparks
// fizzing off the snapped antenna stub. Same visual lineage as
// PortraitPlaceholder but in distress.
export function BrokenRobot({
  className = "",
  title = "Broken robot",
}: IllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      className={`${className} block`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Snapped antenna stub (still attached) */}
      <rect x="11" y="2" width="2" height="2" fill="currentColor" opacity="0.7" />
      {/* Antenna fragment 1 (mid-fall, rotated visually via offset) */}
      <rect x="6" y="1" width="1" height="2" fill="currentColor" opacity="0.6" />
      <rect x="5" y="3" width="2" height="1" fill="currentColor" opacity="0.6" />
      {/* Antenna fragment 2 (further) */}
      <rect x="17" y="0" width="2" height="1" fill="currentColor" opacity="0.55" />
      <rect x="18" y="1" width="1" height="2" fill="currentColor" opacity="0.55" />
      {/* Sparks */}
      <rect x="9" y="3" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="14" y="3" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="11" y="1" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="13" y="1" width="1" height="1" fill="currentColor" opacity="0.85" />
      {/* Head body */}
      <rect x="4" y="5" width="16" height="15" fill="currentColor" opacity="0.18" />
      {/* Top edge */}
      <rect x="4" y="5" width="16" height="1" fill="currentColor" opacity="0.65" />
      {/* Bottom edge */}
      <rect x="4" y="19" width="16" height="1" fill="currentColor" opacity="0.65" />
      {/* Side edges */}
      <rect x="4" y="5" width="1" height="15" fill="currentColor" opacity="0.65" />
      <rect x="19" y="5" width="1" height="15" fill="currentColor" opacity="0.65" />
      {/* Forehead crack (zigzag) */}
      <rect x="11" y="6" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="12" y="7" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="11" y="8" width="1" height="1" fill="currentColor" opacity="0.85" />
      <rect x="12" y="9" width="1" height="1" fill="currentColor" opacity="0.85" />
      {/* X eyes — left */}
      <rect x="6" y="10" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="8" y="10" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="7" y="11" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="6" y="12" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="8" y="12" width="1" height="1" fill="currentColor" opacity="0.95" />
      {/* X eyes — right */}
      <rect x="15" y="10" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="17" y="10" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="16" y="11" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="15" y="12" width="1" height="1" fill="currentColor" opacity="0.95" />
      <rect x="17" y="12" width="1" height="1" fill="currentColor" opacity="0.95" />
      {/* Mouth — flatlined */}
      <rect x="9" y="16" width="6" height="1" fill="currentColor" opacity="0.65" />
      {/* Cheek bolts */}
      <rect x="4" y="13" width="1" height="1" fill="currentColor" opacity="0.8" />
      <rect x="19" y="13" width="1" height="1" fill="currentColor" opacity="0.8" />
      {/* Smoke wisps under jaw */}
      <rect x="8" y="21" width="2" height="1" fill="currentColor" opacity="0.3" />
      <rect x="10" y="22" width="2" height="1" fill="currentColor" opacity="0.2" />
      <rect x="13" y="21" width="2" height="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}
