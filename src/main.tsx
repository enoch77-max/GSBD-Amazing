import { createRoot } from "react-dom/client";
import App from "./App";
import { installLocalApi } from "@/lib/local-api";
import { installAssetResolver } from "@/lib/media";
import { bootLive, installLiveFetch, isLive } from "@/lib/live";
import { ops } from "@/db/ops-store";
import { loadPackRecommendationSettings } from "@/lib/pack-recommendations";
import "@/app/globals.css";
import "./preview.css";

installAssetResolver();

/* The merchant console saves smart recommendation rules to PostgreSQL. Pull
   them on boot so every visitor sees the same capsule configuration; the local
   copy stays as a fallback when the site is served as a pure static file. */
void loadPackRecommendationSettings().then((remote) => {
  if (!remote) return;
  ops.updateSettings((current) => ({ ...current, packRecommendations: remote }));
});

const container = document.getElementById("root");

// notFound() and redirect() are control-flow signals, not failures.
const CONTROL_FLOW = new Set([Symbol.for("gsbd.notFound"), Symbol.for("gsbd.redirect")]);

function render() {
  if (!container) return;
  createRoot(container, {
    onCaughtError(error: unknown) {
      const digest = (error as { digest?: symbol })?.digest;
      if (digest && CONTROL_FLOW.has(digest)) return;
      console.error(error);
    },
  }).render(<App />);
}

function renderOffline() {
  if (!container) return;
  container.innerHTML = [
    '<div style="min-height:100vh;display:grid;place-items:center;background:#f5f2e9;padding:20px;font-family:system-ui,sans-serif">',
    '<div style="max-width:26rem;text-align:center;background:#fbf9f3;border:1px solid #e2ddcd;border-radius:18px;padding:28px">',
    '<p style="font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#6b7265">Connection lost</p>',
    '<h1 style="margin:.5rem 0;font-size:1.4rem;color:#0b1712">The shop server did not answer</h1>',
    '<p style="font-size:.86rem;color:#6b7265;line-height:1.6">Check your connection and try again. If this keeps happening, message us on WhatsApp and we will take your order there.</p>',
    '<button id="gsbd-retry" style="margin-top:16px;background:#0b1712;color:#c9f16b;border:0;border-radius:12px;padding:12px 22px;font-size:.85rem;font-weight:600;cursor:pointer">Try again</button>',
    "</div></div>",
  ].join("");
  document.getElementById("gsbd-retry")?.addEventListener("click", () => window.location.reload());
}

if (container) {
  if (isLive()) {
    /* Served by the production backend: sync the live catalogue, then render.
       The fetch shim stays off so /api/* reaches the real server, and every
       same-origin mutation carries the CSRF marker the backend requires. */
    installLiveFetch();
    void bootLive().then(render).catch((error: unknown) => {
      console.error("[live] catalogue sync failed", error);
      renderOffline();
    });
  } else {
    installLocalApi();
    render();
  }
}
