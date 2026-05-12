// Tracks shader paths this client just saved so the toast bridge can
// suppress the echoed SSE event for our own save. Not a security boundary
// — just UX hygiene: without this, saving a shader in the edit page would
// fire a toast in the same window the user is already getting in-page
// feedback from (the Save button's status pill). Cross-window still works:
// Window B that didn't save sees the event with no matching local record
// and toasts normally.
//
// TTL of 4s covers the worst-case server roundtrip + watcher debounce
// (150ms) + SSE flush, with generous headroom for slow disks. Same shape
// as the server-side selfWrite map but lives on the client because the
// "did *I* initiate this" question is per-window, not per-server.

const TTL_MS = 4000;
const recent = new Map<string, number>();

export function noteLocalShaderSave(path: string): void {
  recent.set(path, Date.now());
  if (recent.size > 200) {
    const cutoff = Date.now() - TTL_MS;
    for (const [p, ts] of recent) {
      if (ts < cutoff) recent.delete(p);
    }
  }
}

export function isRecentLocalShaderSave(path: string): boolean {
  const ts = recent.get(path);
  if (!ts) return false;
  if (Date.now() - ts > TTL_MS) {
    recent.delete(path);
    return false;
  }
  return true;
}
