// Tiny pub/sub for "the project state on the server changed."
//
// Dispatched on create / switch / rename / delete / import-once so any
// component watching the projects API (the sidebar chip, the projects
// page itself, any future "active project" display) can refetch without
// either polling or having the page own the refresh of every consumer.
//
// Window-level CustomEvent rather than a module-level bus so popout
// windows that share the same renderer process pick it up too (the
// BroadcastChannel relay used by SSE streams isn't needed — projects
// rarely change and a one-time per-action fetch is cheap).

const EVENT_NAME = "Bleepforge:projects-changed";

export function emitProjectsChanged(): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function onProjectsChanged(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
