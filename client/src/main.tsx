import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./Theme"; // applies saved theme on load (sets data-theme on <html>)
import "./Font"; // applies saved font + UI scale + letter spacing
import "./GlobalTheme"; // reconciles legacy keys → server-backed preferences
import "./index.css";
import { startSyncStream } from "./sync/stream";
import { refreshCatalog } from "./catalog-bus";

// Open the live-sync SSE channel once at startup. Components subscribe via
// window's "Bleepforge:sync" CustomEvent.
startSyncStream();

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
