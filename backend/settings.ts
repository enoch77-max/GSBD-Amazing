/**
 * Store settings, persisted as one validated JSON document. The shape is the
 * same StoreSettings the storefront already uses — the backend is authoritative
 * and the storefront syncs from it — but secrets never leave the server.
 */
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type GatewayId,
  type PublicGateway,
  type PublicSettings,
  type StoreSettings,
} from "../src/lib/settings";
import { query, queryOne } from "./db";
import { badRequest } from "./http";
import { config } from "./config";

export type { StoreSettings };

export async function getSettings(): Promise<StoreSettings> {
  const row = await queryOne<{ data: unknown }>("SELECT data FROM settings WHERE id = 1");
  return mergeSettings(row?.data);
}

type Patch = Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw badRequest(`${field} is too long (max ${max} characters).`);
  return trimmed;
}

function cleanNumber(value: unknown, field: string, min = 0, max = 100_000_000): number {
  const number = typeof value === "string" && value !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) throw badRequest(`${field} must be a number.`);
  const rounded = Math.round(number);
  if (rounded < min || rounded > max) throw badRequest(`${field} is out of range.`);
  return rounded;
}

function cleanBool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw badRequest(`${field} must be true or false.`);
  return value;
}

function cleanEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

const GATEWAY_IDS: GatewayId[] = ["bkash", "nagad", "sslcommerz", "cod"];

/** Strict allow-list validation: unknown keys are rejected, not stored. */
export function sanitizePatch(patch: unknown): Partial<StoreSettings> {
  if (!isRecord(patch)) throw badRequest("Settings must be an object.");
  const out: Record<string, Record<string, unknown>> = {};
  const topKeys: Array<keyof StoreSettings> = ["identity", "payments", "shipping", "marketing", "risk", "notifications", "courier"];
  for (const key of Object.keys(patch)) {
    if (!topKeys.includes(key as keyof StoreSettings)) throw badRequest(`Unknown settings section: ${key}.`);
  }

  if (patch.identity !== undefined) {
    if (!isRecord(patch.identity)) throw badRequest("identity must be an object.");
    const allowed = ["name", "legalName", "phone", "whatsapp", "email", "address", "hours", "tradeLicence", "binNumber", "domain"] as const;
    const section: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch.identity)) {
      if (!allowed.includes(key as (typeof allowed)[number])) throw badRequest(`Unknown identity field: ${key}.`);
      section[key] = cleanString(value, key === "address" ? 300 : 120, `identity.${key}`);
    }
    if (section.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(section.email)) throw badRequest("identity.email does not look right.");
    out.identity = section;
  }

  if (patch.payments !== undefined) {
    if (!isRecord(patch.payments)) throw badRequest("payments must be an object.");
    const section: Record<string, Record<string, unknown>> = {};
    for (const [id, value] of Object.entries(patch.payments)) {
      if (!GATEWAY_IDS.includes(id as GatewayId)) throw badRequest(`Unknown gateway: ${id}.`);
      if (!isRecord(value)) throw badRequest(`payments.${id} must be an object.`);
      const allowed = ["enabled", "mode", "publicKey", "secretKey", "merchantNumber", "username", "password"] as const;
      const gateway: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        if (!allowed.includes(key as (typeof allowed)[number])) throw badRequest(`Unknown payments.${id} field: ${key}.`);
        if (key === "enabled") gateway[key] = cleanBool(entry, `payments.${id}.enabled`);
        else if (key === "mode") gateway[key] = cleanEnum(entry, ["sandbox", "live"], `payments.${id}.mode`);
        else gateway[key] = cleanString(entry, 200, `payments.${id}.${key}`);
      }
      section[id] = gateway;
    }
    out.payments = section;
  }

  if (patch.shipping !== undefined) {
    if (!isRecord(patch.shipping)) throw badRequest("shipping must be an object.");
    const numbers = ["freeThreshold", "insideDhaka", "outsideDhaka", "expressInside", "expressOutside", "codMaxOrder", "codAdvanceAbove", "codAdvanceAmount"] as const;
    const section: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.shipping)) {
      if (key === "codEnabled") section[key] = cleanBool(value, "shipping.codEnabled");
      else if ((numbers as readonly string[]).includes(key)) section[key] = cleanNumber(value, `shipping.${key}`);
      else throw badRequest(`Unknown shipping field: ${key}.`);
    }
    out.shipping = section;
  }

  if (patch.marketing !== undefined) {
    if (!isRecord(patch.marketing)) throw badRequest("marketing must be an object.");
    const strings = ["metaPixelId", "metaTestEventCode", "metaAccessToken", "ga4MeasurementId", "tiktokPixelId"] as const;
    const section: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.marketing)) {
      if ((strings as readonly string[]).includes(key)) section[key] = cleanString(value, 200, `marketing.${key}`);
      else if (key === "conversionsApi" || key === "consentRequired") section[key] = cleanBool(value, `marketing.${key}`);
      else throw badRequest(`Unknown marketing field: ${key}.`);
    }
    out.marketing = section;
  }

  if (patch.risk !== undefined) {
    if (!isRecord(patch.risk)) throw badRequest("risk must be an object.");
    const numbers = ["codStrikeLimit", "maxOrdersPerPhonePerDay", "maxOrderValue", "promoPerPhoneLimit"] as const;
    const section: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.risk)) {
      if ((numbers as readonly string[]).includes(key)) section[key] = cleanNumber(value, `risk.${key}`);
      else if (key === "requirePhoneOtp") section[key] = cleanBool(value, "risk.requirePhoneOtp");
      else throw badRequest(`Unknown risk field: ${key}.`);
    }
    out.risk = section;
  }

  if (patch.notifications !== undefined) {
    if (!isRecord(patch.notifications)) throw badRequest("notifications must be an object.");
    const section: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.notifications)) {
      if (["orderConfirmation", "statusUpdates", "abandonedCart"].includes(key)) section[key] = cleanBool(value, `notifications.${key}`);
      else if (key === "abandonedCartAfterMinutes" || key === "lowStockThreshold") section[key] = cleanNumber(value, `notifications.${key}`);
      else if (key === "smsProvider") section[key] = cleanEnum(value, ["none", "bulksmsbd", "greenweb"], "notifications.smsProvider");
      else if (key === "smsApiKey" || key === "smsSenderId") section[key] = cleanString(value, 120, `notifications.${key}`);
      else throw badRequest(`Unknown notifications field: ${key}.`);
    }
    out.notifications = section;
  }

  if (patch.courier !== undefined) {
    if (!isRecord(patch.courier)) throw badRequest("courier must be an object.");
    const section: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.courier)) {
      if (key === "provider") section[key] = cleanEnum(value, ["manual", "pathao", "steadfast"], "courier.provider");
      else if (key === "apiKey" || key === "apiSecret") section[key] = cleanString(value, 200, `courier.${key}`);
      else if (key === "autoBook") section[key] = cleanBool(value, "courier.autoBook");
      else throw badRequest(`Unknown courier field: ${key}.`);
    }
    out.courier = section;
  }

  return out as Partial<StoreSettings>;
}

function deepMerge(base: StoreSettings, patch: Partial<StoreSettings>): StoreSettings {
  const next = structuredClone(base);
  for (const [section, values] of Object.entries(patch)) {
    if (section === "payments" && values) {
      for (const [id, gateway] of Object.entries(values as Record<string, Record<string, unknown>>)) {
        Object.assign(next.payments[id as GatewayId], gateway);
      }
    } else if (values) {
      Object.assign(next[section as keyof StoreSettings] as Record<string, unknown>, values);
    }
  }
  return next;
}

export async function updateSettings(patch: unknown): Promise<StoreSettings> {
  const clean = sanitizePatch(patch);
  const merged = deepMerge(await getSettings(), clean);
  await query("UPDATE settings SET data = $1, updated_at = NOW() WHERE id = 1", [JSON.stringify(merged)]);
  return merged;
}

/* ------------------------------------------------------------------ */
/* Public subset — everything the storefront may know, and nothing more */
/* ------------------------------------------------------------------ */

export type { PublicSettings };

export function publicSettings(settings: StoreSettings): PublicSettings {
  const payments = {} as Record<GatewayId, PublicGateway>;
  for (const id of GATEWAY_IDS) {
    const gateway = settings.payments[id];
    const liveReady = gateway.enabled && gateway.mode === "live" && Boolean(gateway.publicKey && gateway.secretKey);
    const ready = id === "cod"
      ? gateway.enabled && settings.shipping.codEnabled
      : gateway.enabled && ((gateway.mode === "sandbox" && !config.isProd) || liveReady);
    const hosted =
      id === "sslcommerz" ? true : id === "bkash" ? liveReady && Boolean(gateway.username && gateway.password) : false;
    payments[id] = { enabled: gateway.enabled, mode: gateway.mode, merchantNumber: gateway.merchantNumber, hosted, ready };
  }
  return {
    identity: settings.identity,
    payments,
    shipping: settings.shipping,
    marketing: {
      metaPixelId: settings.marketing.metaPixelId,
      metaTestEventCode: settings.marketing.metaTestEventCode,
      ga4MeasurementId: settings.marketing.ga4MeasurementId,
      tiktokPixelId: settings.marketing.tiktokPixelId,
      conversionsApi: settings.marketing.conversionsApi,
      consentRequired: settings.marketing.consentRequired,
    },
    risk: { requirePhoneOtp: settings.risk.requirePhoneOtp, promoPerPhoneLimit: settings.risk.promoPerPhoneLimit },
    notifications: {
      abandonedCartAfterMinutes: settings.notifications.abandonedCartAfterMinutes,
      lowStockThreshold: settings.notifications.lowStockThreshold,
      smsProvider: settings.notifications.smsProvider,
    },
    courier: { provider: settings.courier.provider, autoBook: settings.courier.autoBook },
  };
}

export { DEFAULT_SETTINGS };
