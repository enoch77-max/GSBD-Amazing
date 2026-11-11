/**
 * Live mode: the bridge between the storefront and the production backend.
 *
 * When the app is served by `backend/` (Docker/VPS), the server injects
 * `window.__GSBD_LIVE__` into the page. On boot we then sync the catalogue,
 * settings, identity and promos from `/api/catalog` into the existing stores,
 * so every page, component and the owner console runs against real data.
 * Without the flag (arena preview) nothing here activates.
 */
import { store } from "@/db/local-store";
import { ops } from "@/db/ops-store";
import { mergeSettings, type PublicSettings } from "@/lib/settings";
import { PROMOS, STORE } from "@/lib/commerce";
import type { Category, Order, OrderItem, Product, Review } from "@/db/schema";

declare global {
  interface Window {
    __GSBD_LIVE__?: boolean;
    __GSBD_BUILD__?: string;
  }
}

export function isLive(): boolean {
  return typeof window !== "undefined" && window.__GSBD_LIVE__ === true;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** JSON client for the backend. Same-origin cookies + the CSRF fetch marker. */
export async function api<T>(pathname: string, options: { method?: string; body?: unknown; signal?: AbortSignal; cache?: RequestCache } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") headers["x-requested-with"] = "fetch";
  const init: RequestInit = { method, credentials: "same-origin", headers, signal: options.signal, cache: options.cache };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(pathname, init);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = (json as { error?: string } | null)?.error ?? `Request failed (${response.status}).`;
    throw new ApiError(response.status, message);
  }
  return json as T;
}

export function newEventId(prefix = "evt"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/* Order claim tokens live in session storage: enough to open the confirmation
   page after checkout, gone when the tab closes. */
const CLAIM_PREFIX = "gsbd.claim.";

export function saveClaim(orderNumber: string, token: string): void {
  try {
    sessionStorage.setItem(CLAIM_PREFIX + orderNumber.toUpperCase(), token);
  } catch {
    /* private browsing — the phone fallback still works */
  }
}

export function readClaim(orderNumber: string): string | null {
  try {
    return sessionStorage.getItem(CLAIM_PREFIX + orderNumber.toUpperCase());
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */

type JsonProduct = Omit<Product, "createdAt"> & { createdAt: string };
type JsonReview = Omit<Review, "createdAt"> & { createdAt: string };
type JsonOrder = Omit<Order, "createdAt"> & { createdAt: string; paymentStatus?: string };

type CatalogPayload = {
  categories: Category[];
  products: JsonProduct[];
  promos: typeof PROMOS;
  settings: PublicSettings;
  currency: string;
};

/** Pulls the live catalogue + settings on boot or an explicit stock recheck. */
export async function bootLive(signal?: AbortSignal): Promise<void> {
  const catalog = await api<CatalogPayload>("/api/catalog", { signal, cache: "no-store" });
  const products = catalog.products.map(
    (entry) => ({ ...entry, createdAt: new Date(entry.createdAt) }) as unknown as Product,
  );
  store.replaceCatalog(products, catalog.categories);
  ops.set({ settings: mergeSettings(catalog.settings) });

  /* The shop's identity block is a module-level constant; sync it at runtime. */
  const identity = catalog.settings.identity;
  const shipping = catalog.settings.shipping;
  Object.assign(STORE as unknown as Record<string, string | number>, {
    name: identity.name,
    phone: identity.phone,
    whatsapp: identity.whatsapp,
    email: identity.email,
    address: identity.address,
    hours: identity.hours,
    freeShippingThreshold: shipping.freeThreshold,
  });

  PROMOS.length = 0;
  for (const promo of catalog.promos) PROMOS.push(promo);
}

export type LiveProductPayload = {
  product: JsonProduct;
  reviews: JsonReview[];
  related: JsonProduct[];
};

export async function liveFetchProduct(slug: string): Promise<{ product: Product; reviews: Review[]; related: Product[] }> {
  const payload = await api<LiveProductPayload>(`/api/products/${encodeURIComponent(slug)}`);
  return {
    product: { ...payload.product, createdAt: new Date(payload.product.createdAt) } as unknown as Product,
    reviews: payload.reviews.map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt) }) as unknown as Review),
    related: payload.related.map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt) }) as unknown as Product),
  };
}

export type LiveOrderPayload = {
  order: JsonOrder;
  items: OrderItem[];
  events: Array<{ id: number; status: string; label: string; note: string | null; actor: string; at?: string; createdAt?: string }>;
  payment: { method: string; status: string; trxId: string | null };
};

export async function liveFetchOrder(
  orderNumber: string,
  auth: { token?: string | null; phone?: string },
): Promise<{ order: Order & { paymentStatus?: string }; items: OrderItem[]; events: LiveOrderPayload["events"]; payment: LiveOrderPayload["payment"] }> {
  const params = new URLSearchParams();
  if (auth.token) params.set("token", auth.token);
  if (auth.phone) params.set("phone", auth.phone);
  const payload = await api<LiveOrderPayload>(`/api/orders/${encodeURIComponent(orderNumber)}?${params.toString()}`);
  return {
    order: { ...payload.order, createdAt: new Date(payload.order.createdAt) } as unknown as Order & { paymentStatus?: string },
    items: payload.items,
    events: payload.events,
    payment: payload.payment,
  };
}

/**
 * Live-mode fetch wrapper: same-origin mutations automatically carry the CSRF
 * marker the backend requires, so every component can keep using plain fetch().
 */
export function installLiveFetch(): void {
  const w = window as unknown as { __gsbdFetchWrapped?: boolean };
  if (w.__gsbdFetchWrapped) return;
  w.__gsbdFetchWrapped = true;
  const original = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let sameOrigin = false;
    try {
      sameOrigin = new URL(raw, window.location.origin).origin === window.location.origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const headers = new Headers(init?.headers ?? request?.headers);
      if (!headers.has("x-requested-with")) headers.set("x-requested-with", "fetch");
      init = { ...init, headers, credentials: init?.credentials ?? "same-origin" };
    }
    return original(input as RequestInfo, init);
  }) as typeof window.fetch;
}
