/**
 * Marketing measurement: consent, attribution and pixel dispatch.
 *
 * One `track()` call fans out to Meta Pixel, GA4 and TikTok with a shared
 * `event_id` so the browser hit and the server-side Conversions API hit dedupe
 * against each other. Nothing is sent before consent when consent is required,
 * and every dispatch is mirrored into the admin event inspector so an operator
 * can verify tracking without opening Meta Events Manager.
 */
import { ops, type Attribution, type TrackedEvent } from "@/db/ops-store";

type W = Window & {
  fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; push?: unknown; callMethod?: unknown };
  _fbq?: unknown;
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
  ttq?: { load: (id: string) => void; page: () => void; track: (name: string, params?: unknown, opts?: unknown) => void };
};

export type StandardEvent =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "Lead"
  | "Contact";

const GA4_MAP: Record<string, string> = {
  PageView: "page_view",
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Lead: "generate_lead",
  Contact: "contact",
};

const TIKTOK_MAP: Record<string, string> = {
  ViewContent: "ViewContent",
  Search: "Search",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
  AddPaymentInfo: "AddPaymentInfo",
  Purchase: "CompletePayment",
  Lead: "SubmitForm",
  Contact: "Contact",
};

function script(src: string, id: string) {
  if (document.getElementById(id)) return;
  const tag = document.createElement("script");
  tag.id = id;
  tag.async = true;
  tag.src = src;
  document.head.appendChild(tag);
}

/* ---------------------------------------------------------------- */
/* Session + attribution                                             */
/* ---------------------------------------------------------------- */

function readAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  const hashParams = new URLSearchParams(hashQuery);
  const get = (key: string) => params.get(key) ?? hashParams.get(key) ?? "";
  const referrer = document.referrer || "";

  const fbclid = Boolean(get("fbclid"));
  const gclid = Boolean(get("gclid"));
  const ttclid = Boolean(get("ttclid"));

  let source = get("utm_source");
  let medium = get("utm_medium");
  if (!source) {
    if (fbclid) { source = "facebook"; medium = "paid_social"; }
    else if (gclid) { source = "google"; medium = "cpc"; }
    else if (ttclid) { source = "tiktok"; medium = "paid_social"; }
    else if (referrer && !referrer.includes(window.location.host)) {
      try { source = new URL(referrer).hostname.replace(/^www\./, ""); medium = "referral"; } catch { source = "referral"; medium = "referral"; }
    } else { source = "direct"; medium = "none"; }
  }

  return {
    source: source || "direct",
    medium: medium || "none",
    campaign: get("utm_campaign") || "(not set)",
    content: get("utm_content") || "(not set)",
    term: get("utm_term") || "(not set)",
    fbclid,
    gclid,
    ttclid,
    landingPage: window.location.pathname + window.location.search,
    referrer,
    firstSeen: new Date().toISOString(),
    sessionId: ops.state.session?.id ?? ops.uid(),
  };
}

/** First-touch attribution wins for the session, matching how ad platforms credit conversions. */
export function initAnalytics() {
  if (typeof window === "undefined") return;
  const current = readAttribution();
  const existing = ops.state.attribution;
  const paidTouch = current.fbclid || current.gclid || current.ttclid || current.medium.includes("cpc") || current.medium.includes("paid");
  const session = ops.state.session ?? { id: current.sessionId, startedAt: new Date().toISOString() };

  ops.set({
    session,
    attribution: existing && !paidTouch ? { ...existing, sessionId: session.id } : { ...current, sessionId: session.id },
  });

  applyConsent();
}

export function currentAttribution(): Attribution | null {
  return ops.state.attribution;
}

/* ---------------------------------------------------------------- */
/* Consent                                                           */
/* ---------------------------------------------------------------- */

export function consentGranted(): boolean {
  const { consent, settings } = ops.state;
  if (!settings.marketing.consentRequired) return true;
  return consent === "granted";
}

export function setConsent(value: "granted" | "denied") {
  ops.set({ consent: value });
  applyConsent();
  if (value === "granted") track("PageView", { page_path: window.location.pathname });
}

function applyConsent() {
  const { settings } = ops.state;
  const granted = consentGranted();
  if (!granted) return;
  const { metaPixelId, ga4MeasurementId, tiktokPixelId } = settings.marketing;

  if (metaPixelId.trim()) loadMeta(metaPixelId.trim());
  if (ga4MeasurementId.trim()) loadGa4(ga4MeasurementId.trim());
  if (tiktokPixelId.trim()) loadTikTok(tiktokPixelId.trim());
}

function loadMeta(id: string) {
  const w = window as W;
  if (w.fbq) return;
  /* Standard Meta Pixel bootstrap, inlined so no third-party file is bundled. */
  const fbq = function (...args: unknown[]) {
    (fbq.queue = fbq.queue ?? []).push(args);
  } as NonNullable<W["fbq"]>;
  fbq.queue = [];
  fbq.loaded = true;
  w.fbq = fbq;
  w._fbq = fbq;
  script("https://connect.facebook.net/en_US/fbevents.js", "gsbd-meta-pixel");
  fbq("init", id);
}

function loadGa4(id: string) {
  const w = window as W;
  if (w.gtag) return;
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = (...args: unknown[]) => void w.dataLayer!.push(args);
  script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, "gsbd-ga4");
  w.gtag("js", new Date());
  w.gtag("config", id, { send_page_view: false });
}

function loadTikTok(id: string) {
  const w = window as W;
  if (w.ttq) return;
  const ttq = {
    queue: [] as unknown[],
    load(pixelId: string) { script("https://analytics.tiktok.com/i18n/pixel/events.js", "gsbd-tiktok"); void pixelId; },
    page() { ttq.track("Pageview"); },
    track(name: string, params?: unknown) { ttq.queue.push([name, params]); },
  };
  w.ttq = ttq as unknown as W["ttq"];
  ttq.load(id);
}

/* ---------------------------------------------------------------- */
/* Dispatch                                                          */
/* ---------------------------------------------------------------- */

export type TrackPayload = {
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  num_items?: number;
  search_string?: string;
  order_id?: string;
  [key: string]: unknown;
};

export function track(name: StandardEvent, payload: TrackPayload = {}, forceEventId?: string): TrackedEvent {
  const { settings } = ops.state;
  const granted = consentGranted();
  const eventId = forceEventId ?? (`${name.toLowerCase()}_${ops.uid()}`);
  const attribution = ops.state.attribution;
  const destinations: string[] = [];

  const params = {
    currency: "BDT",
    ...payload,
    event_id: eventId,
    traffic_source: attribution?.source ?? "direct",
    campaign: attribution?.campaign ?? "(not set)",
  };

  if (granted) {
    const w = window as W;
    if (settings.marketing.metaPixelId.trim() && w.fbq) {
      try {
        w.fbq("track", name, params, { eventID: eventId });
        destinations.push("meta");
      } catch (error) { console.warn("[analytics] meta", error); }
    }
    if (settings.marketing.ga4MeasurementId.trim() && w.gtag) {
      try {
        w.gtag("event", GA4_MAP[name] ?? name, {
          ...params,
          transaction_id: payload.order_id,
          items: payload.contents?.map((item) => ({ item_id: item.id, quantity: item.quantity, price: item.item_price })),
        });
        destinations.push("ga4");
      } catch (error) { console.warn("[analytics] ga4", error); }
    }
    const tiktokName = TIKTOK_MAP[name];
    if (settings.marketing.tiktokPixelId.trim() && w.ttq && tiktokName) {
      try {
        w.ttq.track(tiktokName, params, { event_id: eventId });
        destinations.push("tiktok");
      } catch (error) { console.warn("[analytics] tiktok", error); }
    }
    if (settings.marketing.conversionsApi) {
      destinations.push("capi");
      void sendServerEvent(name, eventId, params);
    }
  }

  return ops.pushEvent({
    name,
    params,
    destinations: granted ? destinations : [],
    consent: granted,
    sessionId: ops.state.session?.id ?? "anonymous",
  });
}

/**
 * Server-side relay. `/api/events` forwards to Meta's Conversions API with the
 * access token held on the server; the browser never sees it. Failures are
 * silent by design — measurement must never break checkout.
 */
async function sendServerEvent(name: string, eventId: string, params: Record<string, unknown>) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event_name: name,
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: window.location.href,
        custom_data: params,
        attribution: ops.state.attribution,
        fbc: readCookie("_fbc"),
        fbp: readCookie("_fbp"),
      }),
    });
  } catch {
    /* offline or preview build without the endpoint — the browser pixel still fired */
  }
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

let lastPage = "";
export function trackPageView(path: string) {
  if (path === lastPage) return;
  lastPage = path;
  track("PageView", { page_path: path });
}
