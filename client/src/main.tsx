import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles/Theme"; // applies saved theme on load (sets data-theme on <html>)
import "./styles/Font"; // applies saved font + UI scale + letter spacing
import "./styles/GlobalTheme"; // reconciles legacy keys → server-backed preferences
import "./styles/index.css";
import { closeAssetStream, startAssetStream } from "./lib/assets/stream";
import { closeSavesStream, startSavesStream } from "./lib/saves/stream";
import { closeShaderStream, startShaderStream } from "./lib/shaders/stream";
import { closeSyncStream, startSyncStream } from "./lib/sync/stream";
import { closeGlobalThemeChannel } from "./styles/GlobalTheme";
import { refreshCatalog } from "./lib/catalog-bus";
import { markBootCheckpoint } from "./lib/boot/progress";

// Stamp the version into document.title so the OS window title bar shows
// "Bleepforge — v0.2.0" once the page loads. Electron's BrowserWindow
// `title` option is the *initial* title — index.html's <title> overrides
// it the moment the document parses. We set this here (before React
// renders) so the title is right from frame 1 and survives any future
// re-render. Browser mode benefits too: the browser tab title now carries
// the version.
//
// Popouts get a route-aware label so the OS title bar surfaces what the
// window is for — e.g. "Bleepforge — Diagnostics · v0.2.0". Derived from
// the first path segment; set-once-at-module-load (good enough for v1
// since popouts mostly stay within their original route subtree).
{
  const isPopoutWindow =
    new URLSearchParams(window.location.search).get("popout") === "1";
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  const label = isPopoutWindow && firstSegment
    ? firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
    : "";
  document.title = label
    ? `Bleepforge — ${label} · v${__APP_VERSION__}`
    : `Bleepforge — v${__APP_VERSION__}`;
}

// First boot checkpoint: server is up. Fires the splash's progress bar
// past the "Connecting to server…" phase. /api/health is a tiny cached
// endpoint, so this is essentially free. Failure leaves the checkpoint
// unmarked → splash hits its 10s timeout → user sees the "Continue
// anyway" affordance.
void fetch("/api/health")
  .then((r) => {
    if (r.ok) markBootCheckpoint("server");
  })
  .catch(() => {
    /* leave unmarked; splash timeout will surface the issue */
  });

// Open the live-sync SSE channel once at startup. Components subscribe via
// window's "Bleepforge:sync" CustomEvent.
startSyncStream();
// Same pattern, separate channel — saves cover both directions, so this
// drives the live updates in the Diagnostics → Saves tab.
startSavesStream();
// Third channel — image-asset add/change/remove for the gallery.
startAssetStream();
// Fourth channel — .gdshader add/change/remove for the shader gallery
// + edit page (external-edit banner).
startShaderStream();

// Refresh the autocomplete catalog on any external change so datalists
// stay current with the data the user just saw flow in from Godot.
// Shader events feed the same refresh — adding/renaming/removing a
// shader externally needs to flow into the Ctrl+K AppSearch index too.
window.addEventListener("Bleepforge:sync", () => refreshCatalog());
window.addEventListener("Bleepforge:shader", () => refreshCatalog());

// Renderer teardown cleanup. Without this, Electron's force-close of the
// renderer process leaves Chromium to forcibly cleanup our long-lived
// globals — 4 EventSources, 4 SSE-relay BroadcastChannels, the theme-
// sync BroadcastChannel — and that forced cleanup trips a CHECK on
// Chromium 130 / Linux, producing a SIGTRAP coredump every time the
// user closes a Bleepforge window. `pagehide` fires before Chromium
// kills the renderer, so we get a clean window to release everything
// gracefully. (`pagehide` over `beforeunload` because the latter is for
// "ask user to confirm" semantics; we just want to release resources.)
window.addEventListener("pagehide", () => {
  closeSyncStream();
  closeSavesStream();
  closeAssetStream();
  closeShaderStream();
  closeGlobalThemeChannel();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
