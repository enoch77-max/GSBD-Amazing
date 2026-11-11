/**
 * Operational persistence: everything the merchant console writes.
 *
 * The seeded catalogue in `local-store` is the immutable baseline; this layer
 * holds the deltas an operator creates (status changes, stock corrections,
 * fulfilment events, ad spend, outbox messages) under its own storage key so a
 * reset of the catalogue never destroys trading history.
 *
 * In production the identical shapes are Postgres rows — see
 * `src/db/schema.ts` (orderEvents, orderAttribution, notifications, adSpend)
 * and the admin route handlers in `src/app/api/admin/**`.
 */
import { mergeSettings, type StoreSettings } from "@/lib/settings";
import { DEFAULT_PROMOS, replacePromos, type Promo } from "@/lib/commerce";
import { sanitizePermissions, type AdminRole } from "@/lib/admin-access";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  /** null = the shipped preview PIN (owner only). */
  pinHash: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AuditEntry = {
  id: string;
  at: string;
  userId: string;
  userName: string;
  roleId: string;
  action: string;
  target: string;
  detail?: string;
};

export type OrderStatus = "pending" | "confirmed" | "packing" | "shipped" | "delivered" | "cancelled" | "returned";
export type PaymentStatus = "unpaid" | "authorised" | "paid" | "failed" | "refunded" | "cod_due";

export type OrderEvent = {
  id: string;
  at: string;
  status: OrderStatus;
  label: string;
  note?: string;
  actor: string;
};

export type OrderPatch = {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  trxId?: string;
  events: OrderEvent[];
  notes: Array<{ id: string; at: string; body: string; actor: string }>;
  courier?: { provider: string; consignmentId: string; trackingUrl: string; bookedAt: string };
  attribution?: Attribution;
  riskFlags: string[];
  codStrikes?: number;
  otpVerified?: boolean;
  refundAmount?: number;
};

export type Attribution = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  fbclid: boolean;
  gclid: boolean;
  ttclid: boolean;
  landingPage: string;
  referrer: string;
  firstSeen: string;
  sessionId: string;
};

export type OutboxMessage = {
  id: string;
  at: string;
  channel: "sms" | "whatsapp" | "email";
  to: string;
  template: string;
  subject: string;
  body: string;
  orderNumber?: string;
  status: "queued" | "sent" | "failed" | "skipped";
  reason?: string;
};

export type TrackedEvent = {
  id: string;
  at: string;
  name: string;
  params: Record<string, unknown>;
  destinations: string[];
  consent: boolean;
  sessionId: string;
};

export type AbandonedCart = {
  id: string;
  phone: string;
  name: string;
  updatedAt: string;
  items: Array<{ slug: string; name: string; qty: number; price: number }>;
  value: number;
  recovered: boolean;
  reminded: boolean;
  attribution?: Attribution;
};

export type AdminAuth = { pinHash: string | null; failures: number; lockedUntil: string | null; changedAt: string | null };

export type OpsState = {
  settings: StoreSettings;
  orderPatches: Record<string, OrderPatch>;
  outbox: OutboxMessage[];
  events: TrackedEvent[];
  carts: AbandonedCart[];
  adSpend: Array<{ date: string; channel: string; amount: number }>;
  promoUsage: Record<string, string[]>;
  consent: "unset" | "granted" | "denied";
  attribution: Attribution | null;
  session: { id: string; startedAt: string } | null;
  adminSession: { at: string; userId?: string } | null;
  adminUsers: AdminUser[];
  /** Custom roles only; built-in roles live in code. */
  adminRoles: AdminRole[];
  audit: AuditEntry[];
  /** Console-managed discount codes; null = shipped defaults. */
  promos: Promo[] | null;
  /** Preview console access. The PIN is stored hashed; lockout slows guessing. */
  adminAuth: AdminAuth;
  /** Show the generated demo order book. Real orders are unaffected. */
  sampleData: boolean;
};

const KEY = "gsbd.ops.v1";
const MAX_EVENTS = 400;
const MAX_OUTBOX = 300;
const MAX_AUDIT = 600;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function emptyState(): OpsState {
  return {
    settings: mergeSettings(null),
    orderPatches: {},
    outbox: [],
    events: [],
    carts: [],
    adSpend: seedSpend(),
    promoUsage: {},
    consent: "unset",
    attribution: null,
    session: null,
    adminSession: null,
    adminUsers: [],
    adminRoles: [],
    audit: [],
    promos: null,
    adminAuth: { pinHash: null, failures: 0, lockedUntil: null, changedAt: null },
    sampleData: true,
  };
}

/** A fortnight of plausible spend so the ROAS report is meaningful on first open. */
function seedSpend(): OpsState["adSpend"] {
  const rows: OpsState["adSpend"] = [];
  const today = new Date();
  for (let day = 13; day >= 0; day -= 1) {
    const date = new Date(today.getTime() - day * 86400000).toISOString().slice(0, 10);
    const weekend = [5].includes(new Date(date).getDay());
    rows.push({ date, channel: "meta", amount: Math.round((weekend ? 1450 : 980) + (day % 4) * 160) });
    rows.push({ date, channel: "google", amount: Math.round((weekend ? 520 : 380) + (day % 3) * 90) });
    if (day % 3 === 0) rows.push({ date, channel: "tiktok", amount: 300 + (day % 5) * 45 });
  }
  return rows;
}

function hydrate(): OpsState {
  const base = emptyState();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<OpsState>;
    return {
      ...base,
      ...saved,
      settings: mergeSettings(saved.settings),
      orderPatches: saved.orderPatches ?? {},
      outbox: Array.isArray(saved.outbox) ? saved.outbox.slice(0, MAX_OUTBOX) : [],
      events: Array.isArray(saved.events) ? saved.events.slice(0, MAX_EVENTS) : [],
      carts: Array.isArray(saved.carts) ? saved.carts : [],
      adSpend: Array.isArray(saved.adSpend) && saved.adSpend.length ? saved.adSpend : base.adSpend,
      promoUsage: saved.promoUsage ?? {},
      adminSession: saved.adminSession ?? null,
      adminUsers: Array.isArray(saved.adminUsers)
        ? saved.adminUsers.filter((u) => u && typeof u.id === "string" && typeof u.name === "string" && typeof u.roleId === "string")
        : [],
      adminRoles: Array.isArray(saved.adminRoles)
        ? saved.adminRoles.filter((r) => r && typeof r.id === "string" && typeof r.name === "string")
            .map((r) => ({ ...r, builtin: false, description: String(r.description ?? ""), permissions: sanitizePermissions(r.permissions) }))
        : [],
      audit: Array.isArray(saved.audit) ? saved.audit.slice(0, MAX_AUDIT) : [],
      promos: Array.isArray(saved.promos) ? saved.promos.filter((p) => p && typeof p.code === "string") : null,
      adminAuth: {
        ...base.adminAuth,
        ...(saved.adminAuth && typeof saved.adminAuth === "object" ? saved.adminAuth : {}),
      },
      sampleData: saved.sampleData ?? true,
    };
  } catch (error) {
    console.warn("[ops] could not restore state", error);
    return base;
  }
}

let state = hydrate();
if (state.promos) replacePromos(state.promos);
let version = 0;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...state, events: state.events.slice(0, MAX_EVENTS), outbox: state.outbox.slice(0, MAX_OUTBOX) }),
    );
  } catch (error) {
    console.warn("[ops] could not persist", error);
  }
}

function commit() {
  version += 1;
  persist();
  listeners.forEach((listener) => listener());
}

export const ops = {
  uid,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  getVersion: () => version,
  get state(): OpsState {
    return state;
  },
  set(patch: Partial<OpsState>) {
    state = { ...state, ...patch };
    commit();
  },
  updateSettings(updater: (current: StoreSettings) => StoreSettings) {
    state = { ...state, settings: updater(structuredClone(state.settings)) };
    commit();
  },
  patchOrder(orderNumber: string, patch: Partial<OrderPatch>) {
    const existing = state.orderPatches[orderNumber] ?? { events: [], notes: [], riskFlags: [] };
    state = {
      ...state,
      orderPatches: {
        ...state.orderPatches,
        [orderNumber]: { ...existing, ...patch },
      },
    };
    commit();
    return state.orderPatches[orderNumber];
  },
  getOrderPatch(orderNumber: string): OrderPatch {
    return state.orderPatches[orderNumber] ?? { events: [], notes: [], riskFlags: [] };
  },
  pushOutbox(message: Omit<OutboxMessage, "id" | "at">) {
    const row: OutboxMessage = { ...message, id: uid(), at: new Date().toISOString() };
    state = { ...state, outbox: [row, ...state.outbox].slice(0, MAX_OUTBOX) };
    commit();
    return row;
  },
  setOutboxStatus(id: string, status: OutboxMessage["status"], reason?: string) {
    state = {
      ...state,
      outbox: state.outbox.map((row) => (row.id === id ? { ...row, status, reason } : row)),
    };
    commit();
  },
  pushEvent(event: Omit<TrackedEvent, "id" | "at">) {
    const row: TrackedEvent = { ...event, id: uid(), at: new Date().toISOString() };
    state = { ...state, events: [row, ...state.events].slice(0, MAX_EVENTS) };
    commit();
    return row;
  },
  upsertCart(cart: AbandonedCart) {
    const rest = state.carts.filter((entry) => entry.id !== cart.id);
    state = { ...state, carts: [cart, ...rest].slice(0, 120) };
    commit();
  },
  removeCart(id: string) {
    state = { ...state, carts: state.carts.filter((entry) => entry.id !== id) };
    commit();
  },
  setSpend(date: string, channel: string, amount: number) {
    const rest = state.adSpend.filter((row) => !(row.date === date && row.channel === channel));
    state = { ...state, adSpend: amount > 0 ? [...rest, { date, channel, amount }] : rest };
    commit();
  },
  recordPromo(code: string, phone: string) {
    const used = state.promoUsage[code] ?? [];
    if (used.includes(phone)) return;
    state = { ...state, promoUsage: { ...state.promoUsage, [code]: [...used, phone] } };
    commit();
  },
  promoUses(code: string, phone: string) {
    return (state.promoUsage[code] ?? []).filter((entry) => entry === phone).length;
  },
  pushAudit(entry: Omit<AuditEntry, "id" | "at">) {
    const row: AuditEntry = { ...entry, id: uid(), at: new Date().toISOString() };
    state = { ...state, audit: [row, ...state.audit].slice(0, MAX_AUDIT) };
    commit();
    return row;
  },
  setPromos(promos: Promo[] | null) {
    state = { ...state, promos };
    replacePromos(promos ?? DEFAULT_PROMOS.map((promo) => ({ ...promo })));
    commit();
  },
  resetTrading() {
    state = { ...emptyState(), settings: state.settings };
    commit();
  },
};

export { uid as opsUid };
