import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles/Theme"; // applies saved theme on load (sets data-theme on <html>)
import "./styles/Font"; // applies saved font + UI scale + letter spacing
import "./styles/GlobalTheme"; // reconciles legacy keys → server-backed preferences
import "./styles/index.css";
import { startSyncStream } from "./lib/sync/stream";
import { startSavesStream } from "./lib/saves/stream";
import { refreshCatalog } from "./lib/catalog-bus";

// Open the live-sync SSE channel once at startup. Components subscribe via
// window's "Bleepforge:sync" CustomEvent.
startSyncStream();
// Same pattern, separate channel — saves cover both directions, so this
// drives the live updates in the Diagnostics → Saves tab.
startSavesStream();

// Refresh the autocomplete catalog on any external change so datalists
// stay current with the data the user just saw flow in from Godot.
window.addEventListener("Bleepforge:sync", () => refreshCatalog());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
