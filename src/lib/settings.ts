/**
 * Merchant-editable store configuration.
 *
 * Everything an operator must change before taking real money lives here:
 * identity, payment credentials, ad pixels, shipping economics and risk rules.
 * Values persist locally for the preview; in production the same shape is read
 * from environment variables by `backend/config.ts`.
 */

import { DEFAULT_PACK_RECOMMENDATIONS, sanitizePackRecommendations, type PackRecommendationSettings } from "@/lib/pack-recommendations";

export type GatewayId = "bkash" | "nagad" | "sslcommerz" | "cod";

export type GatewayConfig = {
  enabled: boolean;
  /** "sandbox" runs the deterministic test flow, "live" calls the real gateway. */
  mode: "sandbox" | "live";
  publicKey: string;
  secretKey: string;
  /** Manual send-money number shown for person-to-person bKash/Nagad. */
  merchantNumber: string;
  /** bKash Tokenized Checkout API username (live mode). */
  username: string;
  /** bKash Tokenized Checkout API password (live mode). */
  password: string;
};

export type StoreSettings = {
  identity: {
    name: string;
    legalName: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    hours: string;
    tradeLicence: string;
    binNumber: string;
    domain: string;
  };
  payments: Record<GatewayId, GatewayConfig>;
  shipping: {
    freeThreshold: number;
    insideDhaka: number;
    outsideDhaka: number;
    expressInside: number;
    expressOutside: number;
    codEnabled: boolean;
    codMaxOrder: number;
    codAdvanceAbove: number;
    codAdvanceAmount: number;
  };
  marketing: {
    metaAccessToken: string;
    metaPixelId: string;
    metaTestEventCode: string;
    ga4MeasurementId: string;
    tiktokPixelId: string;
    /** Server-side Conversions API is dispatched from /api/events in production. */
    conversionsApi: boolean;
    consentRequired: boolean;
  };
  risk: {
    /** Block a phone number after this many cancelled/refused COD parcels. */
    codStrikeLimit: number;
    maxOrdersPerPhonePerDay: number;
    maxOrderValue: number;
    requirePhoneOtp: boolean;
    promoPerPhoneLimit: number;
  };
  notifications: {
    orderConfirmation: boolean;
    statusUpdates: boolean;
    abandonedCart: boolean;
    abandonedCartAfterMinutes: number;
    lowStockThreshold: number;
    smsProvider: "none" | "bulksmsbd" | "greenweb";
    smsApiKey: string;
    smsSenderId: string;
  };
  courier: {
    provider: "manual" | "pathao" | "steadfast";
    apiKey: string;
    apiSecret: string;
    autoBook: boolean;
  };
  /** Smart "recommended" capsule shown on pack-builder suggestions. */
  packRecommendations: PackRecommendationSettings;
};

export const DEFAULT_SETTINGS: StoreSettings = {
  identity: {
    name: "Glowing Space BD",
    legalName: "Glowing Space Electronics",
    phone: "+880 1400 788 738",
    whatsapp: "8801400788738",
    email: "hello@glowingspacebd.com",
    address: "Shop 12, Level 2, Mirpur DOHS Shopping Complex, Dhaka 1216",
    hours: "Sat–Thu · 10:00–20:00",
    tradeLicence: "TRAD/DNCC/042187/2023",
    binNumber: "004512783-0201",
    domain: "glowingspacebd.com",
  },
  payments: {
    bkash: { enabled: true, mode: "sandbox", publicKey: "", secretKey: "", merchantNumber: "01400788738", username: "", password: "" },
    nagad: { enabled: true, mode: "sandbox", publicKey: "", secretKey: "", merchantNumber: "01400788738", username: "", password: "" },
    sslcommerz: { enabled: true, mode: "sandbox", publicKey: "", secretKey: "", merchantNumber: "", username: "", password: "" },
    cod: { enabled: true, mode: "live", publicKey: "", secretKey: "", merchantNumber: "", username: "", password: "" },
  },
  shipping: {
    freeThreshold: 2500,
    insideDhaka: 80,
    outsideDhaka: 130,
    expressInside: 150,
    expressOutside: 220,
    codEnabled: true,
    codMaxOrder: 25000,
    codAdvanceAbove: 15000,
    codAdvanceAmount: 100,
  },
  marketing: {
    metaAccessToken: "",
    metaPixelId: "",
    metaTestEventCode: "",
    ga4MeasurementId: "",
    tiktokPixelId: "",
    conversionsApi: true,
    consentRequired: true,
  },
  risk: {
    codStrikeLimit: 2,
    maxOrdersPerPhonePerDay: 4,
    maxOrderValue: 150000,
    requirePhoneOtp: true,
    promoPerPhoneLimit: 1,
  },
  notifications: {
    orderConfirmation: true,
    statusUpdates: true,
    abandonedCart: true,
    abandonedCartAfterMinutes: 90,
    lowStockThreshold: 6,
    smsProvider: "none",
    smsApiKey: "",
    smsSenderId: "GLOWINGSPACE",
  },
  courier: { provider: "manual", apiKey: "", apiSecret: "", autoBook: false },
  packRecommendations: structuredClone(DEFAULT_PACK_RECOMMENDATIONS),
};

/** Deep-merges persisted values over defaults so new settings never break old saves. */
export function mergeSettings(saved: unknown): StoreSettings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!saved || typeof saved !== "object") return base;
  const source = saved as Record<string, Record<string, unknown>>;
  for (const section of Object.keys(base) as Array<keyof StoreSettings>) {
    const incoming = source[section];
    if (!incoming || typeof incoming !== "object") continue;
    if (section === "payments") {
      for (const id of Object.keys(base.payments) as GatewayId[]) {
        const value = incoming[id];
        if (value && typeof value === "object") {
          base.payments[id] = { ...base.payments[id], ...(value as Partial<GatewayConfig>) };
        }
      }
    } else if (section === "packRecommendations") {
      base.packRecommendations = sanitizePackRecommendations(incoming);
    } else {
      Object.assign(base[section] as Record<string, unknown>, incoming);
    }
  }
  return base;
}

/** Gateways are only "live" when both credentials are present — no silent half-config. */
export function gatewayReady(id: GatewayId, settings: StoreSettings): boolean {
  const config = settings.payments[id];
  if (!config.enabled) return false;
  if (id === "cod") return settings.shipping.codEnabled;
  if (config.mode === "sandbox") return true;
  return Boolean(config.publicKey.trim() && config.secretKey.trim());
}

/**
 * The subset of settings the storefront may know. Secrets (gateway keys, SMS
 * key, courier secret, CAPI token) are stripped server-side and never cross
 * the wire — the backend's `publicSettings()` returns exactly this shape.
 */
export type PublicGateway = {
  enabled: boolean;
  mode: "sandbox" | "live";
  merchantNumber: string;
  /** True when the customer pays on a hosted provider page instead of typing a TrxID. */
  hosted: boolean;
  /** False when a live gateway is missing credentials — the method must be hidden. */
  ready: boolean;
};

export type PublicSettings = {
  identity: StoreSettings["identity"];
  payments: Record<GatewayId, PublicGateway>;
  shipping: StoreSettings["shipping"];
  marketing: Pick<
    StoreSettings["marketing"],
    "metaPixelId" | "metaTestEventCode" | "ga4MeasurementId" | "tiktokPixelId" | "conversionsApi" | "consentRequired"
  >;
  risk: Pick<StoreSettings["risk"], "requirePhoneOtp" | "promoPerPhoneLimit">;
  notifications: Pick<StoreSettings["notifications"], "abandonedCartAfterMinutes" | "lowStockThreshold"> & {
    smsProvider: string;
  };
  courier: Pick<StoreSettings["courier"], "provider" | "autoBook">;
  packRecommendations: PackRecommendationSettings;
};

export type ReadinessIssue = { id: string; label: string; detail: string; severity: "blocker" | "warning"; href: string };

/** Pre-flight checklist shown in the admin console before spending on ads. */
export function readinessAudit(settings: StoreSettings): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const { identity, payments, marketing, notifications } = settings;

  const liveGateway = (["bkash", "nagad", "sslcommerz"] as GatewayId[]).some(
    (id) => payments[id].enabled && payments[id].mode === "live" && payments[id].publicKey && payments[id].secretKey,
  );
  if (!liveGateway) {
    issues.push({
      id: "gateway",
      label: "No live payment gateway",
      detail: "bKash, Nagad and SSLCommerz are in sandbox. Add merchant credentials to capture real payments.",
      severity: "blocker",
      href: "#payments",
    });
  }
  if (!marketing.metaPixelId.trim()) {
    issues.push({
      id: "pixel",
      label: "Meta Pixel not connected",
      detail: "Without a pixel ID, ad spend cannot be attributed and campaigns will not optimise for purchases.",
      severity: "blocker",
      href: "#marketing",
    });
  }
  if (!marketing.ga4MeasurementId.trim()) {
    issues.push({
      id: "ga4",
      label: "GA4 not connected",
      detail: "Add a measurement ID to track sessions, funnels and landing-page performance.",
      severity: "warning",
      href: "#marketing",
    });
  }
  if (!identity.tradeLicence.trim() || !identity.binNumber.trim()) {
    issues.push({
      id: "legal",
      label: "Business identifiers missing",
      detail: "Trade licence and BIN are required by Bangladeshi payment gateways during merchant onboarding.",
      severity: "blocker",
      href: "#identity",
    });
  }
  if (notifications.smsProvider === "none") {
    issues.push({
      id: "sms",
      label: "SMS provider not configured",
      detail: "Order confirmations and courier updates queue in the outbox but are not delivered until an SMS provider is set.",
      severity: "warning",
      href: "#notifications",
    });
  }
  if (settings.courier.provider === "manual") {
    issues.push({
      id: "courier",
      label: "Courier booking is manual",
      detail: "Parcels must be entered into the Pathao/Steadfast dashboard by hand. Connect an API key to auto-book.",
      severity: "warning",
      href: "#courier",
    });
  }
  if (!marketing.consentRequired) {
    issues.push({
      id: "consent",
      label: "Consent banner disabled",
      detail: "Meta and Google require a lawful basis for tracking in several markets. Keep the banner enabled.",
      severity: "warning",
      href: "#marketing",
    });
  }
  return issues;
}
