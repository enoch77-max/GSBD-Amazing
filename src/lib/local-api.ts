/**
 * In-browser implementation of the App Router route handlers in `src/app/api/**`.
 *
 * The handlers below mirror the originals one-for-one (same validation, same
 * status codes, same JSON payloads) but read and write the seeded storefront
 * tables instead of PostgreSQL, so the static preview supports the full
 * browse → bag → checkout → confirmation → tracking loop.
 */
import { store } from "@/db/local-store";
import { isLive } from "./live";
import { ops } from "@/db/ops-store";
import { queueConfirmation, screenOrder } from "@/lib/ops";
import {
  DELIVERY_METHODS,
  PAYMENT_METHODS,
  STORE,
  deliveryPrice,
  findPromo,
  promoDiscount,
  type DeliveryMethod,
} from "./commerce";
import { createOrder, getProductBySlug, getOrderByNumber, recalculateProductRating } from "./queries";
import { calculatePack } from "./pack-builder";

const FALLBACK_IMAGE = "/images/col-cells.jpg";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const wait = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

async function searchProducts(url: URL) {
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) return json({ results: [] });
  const term = query.toLowerCase();
  const rows = store.tables.products
    .filter(
      (product) =>
        product.stock >= 0 &&
        [product.name, product.brand, product.shortDescription, product.categorySlug].some((field) =>
          field.toLowerCase().includes(term),
        ),
    )
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.rating - a.rating)
    .slice(0, 6);

  return json({
    results: rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      price: row.price,
      image: row.images[0] ?? FALLBACK_IMAGE,
      rating: row.rating,
      stock: row.stock,
      categorySlug: row.categorySlug,
    })),
  });
}

async function upsellProducts() {
  const rows = store.tables.products
    .filter(
      (product) =>
        product.stock > 0 &&
        ["bms-circuits", "tools-safety", "diy-prototyping"].includes(product.categorySlug) &&
        product.price < 1500,
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  return json({
    products: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      price: row.price,
      image: row.images[0] ?? FALLBACK_IMAGE,
      stock: row.stock,
    })),
  });
}

async function postReview(body: Record<string, unknown>) {
  const productSlug = String(body.productSlug ?? "").trim();
  const author = String(body.author ?? "").trim();
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  const rating = Number(body.rating);

  if (!productSlug || !author || !title || !text) return json({ error: "Please fill in every field." }, 400);
  if (author.length > 60 || title.length > 90 || text.length > 900) {
    return json({ error: "Please keep your review a little shorter." }, 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: "Choose a rating between 1 and 5 stars." }, 400);
  }

  const product = await getProductBySlug(productSlug);
  if (!product) return json({ error: "That product no longer exists." }, 404);

  const review = store.insertReview({
    productSlug,
    author,
    location: String(body.location ?? "").trim() || "Dhaka",
    rating,
    title,
    body: text,
    verified: false,
  });

  await recalculateProductRating(productSlug);
  return json({ ok: true, review }, 201);
}

async function trackOrder(url: URL) {
  const number = url.searchParams.get("number")?.trim();
  const phone = url.searchParams.get("phone")?.replace(/[\s-]/g, "");

  if (!number) return json({ error: "Enter your order number." }, 400);
  if (!phone || !/^01[3-9]\d{8}$/.test(phone)) {
    return json({ error: "Enter the 11-digit mobile number used for the order." }, 400);
  }

  const result = await getOrderByNumber(number);
  if (!result) return json({ error: "No order found with that number." }, 404);
  if (result.order.phone.replace(/[\s-]/g, "") !== phone) {
    return json({ error: "That order number and mobile number do not match." }, 403);
  }
  return json({ order: result.order, items: result.items });
}

async function postOrder(body: Record<string, any>) {
  const customerName = String(body.customerName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const district = String(body.district ?? "").trim();
  const address = String(body.address ?? "").trim();
  const items = (Array.isArray(body.items) ? body.items : []).filter(
    (item: any) => typeof item?.slug === "string" && Number.isFinite(Number(item?.qty)),
  );

  if (customerName.length < 3) return json({ error: "Please tell us your full name." }, 400);
  if (!/^01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, ""))) {
    return json({ error: "Enter a valid 11-digit Bangladeshi mobile number." }, 400);
  }
  if (!district || address.length < 10) {
    return json({ error: "Add a district and a full delivery address." }, 400);
  }
  if (items.length === 0) return json({ error: "Your bag is empty." }, 400);

  const paymentMethod = PAYMENT_METHODS.some((method) => method.id === body.paymentMethod)
    ? String(body.paymentMethod)
    : "cod";
  const deliveryMethod: DeliveryMethod = DELIVERY_METHODS.some((method) => method.id === body.deliveryMethod)
    ? (body.deliveryMethod as DeliveryMethod)
    : "standard";

  /* --- Risk gates: same rules the merchant configures in the console --- */
  const settings = ops.state.settings;
  const normalisedPhone = phone.replace(/[\s-]/g, "");
  const recent = store.tables.orders.filter(
    (entry) => entry.phone.replace(/[\s-]/g, "") === normalisedPhone && Date.now() - entry.createdAt.getTime() < 86400000,
  );
  if (recent.length >= settings.risk.maxOrdersPerPhonePerDay) {
    return json({ error: "This number has placed several orders today. Please call us on " + settings.identity.phone + " to continue." }, 429);
  }

  const lineItems: Array<{
    productId: number | null;
    slug: string;
    name: string;
    image: string;
    unitPrice: number;
    qty: number;
    packSpec?: import("@/db/schema").OrderItem["packSpec"];
  }> = [];

  for (const item of items) {
    if (item.customPack) {
      try {
        const pack = calculatePack(item.customPack, { products: store.tables.products });
        if (pack.slug !== item.slug) return json({ error: "Custom pack identity does not match its configuration." }, 400);
        if (!pack.available) return json({ error: pack.availabilityNote ?? "This build is unavailable." }, 409);
        if (item.expectedUnitPrice !== undefined && Number(item.expectedUnitPrice) !== pack.price) {
          return json({ error: "The price of your custom pack has changed. Open the pack builder and review the updated quote." }, 409);
        }
        const qty = Math.max(1, Math.min(20, Math.floor(Number(item.qty) || 1)));
        if (qty > pack.maxPacks) return json({ error: "Not enough components are in stock for that quantity." }, 409);
        lineItems.push({
          productId: null,
          slug: pack.slug,
          name: pack.name,
          image: pack.cell.image,
          unitPrice: pack.price,
          qty,
          packSpec: { ...pack.config, components: pack.components },
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Invalid custom pack." }, 400);
      }
      continue;
    }
    if (item.slug.startsWith("custom-pack-")) return json({ error: "Custom packs require a configuration." }, 400);
    const product = store.tables.products.find((entry) => entry.slug === item.slug);
    if (!product) return json({ error: "One of the items in your bag is no longer available." }, 409);
    const qty = Math.max(1, Math.min(20, Math.floor(Number(item.qty) || 1)));
    if (product.stock <= 0) {
      return json({ error: `${product.name} went out of stock. Please remove it and try again.` }, 409);
    }
    lineItems.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.images[0] ?? FALLBACK_IMAGE,
      unitPrice: product.price,
      qty: Math.min(qty, product.stock),
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  let shipping = deliveryPrice(deliveryMethod, district);
  if (deliveryMethod === "standard" && subtotal >= STORE.freeShippingThreshold) shipping = 0;

  const promo = findPromo(String(body.promoCode ?? ""));
  const discount = promoDiscount(promo, subtotal);
  if (promo?.type === "shipping" && discount >= 0 && subtotal >= promo.minSubtotal) shipping = 0;
  const total = Math.max(0, subtotal + shipping - discount);

  if (promo && ops.promoUses(promo.code, normalisedPhone) >= settings.risk.promoPerPhoneLimit) {
    return json({ error: `${promo.code} has already been used on this number.` }, 409);
  }
  if (paymentMethod === "cod" && total > settings.shipping.codMaxOrder) {
    return json(
      { error: `Cash on delivery is limited to ৳${settings.shipping.codMaxOrder.toLocaleString("en-IN")}. Please pay by bKash, Nagad or card for this order.` },
      409,
    );
  }
  if (total > settings.risk.maxOrderValue) {
    return json({ error: "For orders this large please contact us so we can arrange a secure payment." }, 409);
  }

  const order = await createOrder({
    customerName,
    phone: phone.replace(/[\s-]/g, ""),
    email: String(body.email ?? "").trim() || null,
    district,
    address,
    notes: String(body.notes ?? "").trim() || null,
    paymentMethod,
    deliveryMethod,
    promoCode: promo && discount > 0 ? promo.code : null,
    subtotal,
    shipping,
    discount,
    total,
    items: lineItems,
  });

  /* Stock leaves the shelf the moment the order is accepted. */
  lineItems.forEach((item) => {
    if (item.packSpec) {
      for (const component of item.packSpec.components) {
        const product = store.tables.products.find((entry) => entry.slug === component.slug);
        if (product) store.patchProduct(product.slug, { stock: Math.max(0, product.stock - component.qty * item.qty) });
      }
      return;
    }
    const product = store.tables.products.find((entry) => entry.slug === item.slug);
    if (product) store.patchProduct(product.slug, { stock: Math.max(0, product.stock - item.qty) });
  });

  const claimedTrx = typeof body.trxId === "string" ? body.trxId.trim().toUpperCase() : "";
  const verified = body.paymentVerified === true;
  ops.patchOrder(order.orderNumber, {
    status: paymentMethod === "cod" || verified ? "confirmed" : "pending",
    paymentStatus: verified ? "paid" : paymentMethod === "cod" ? "cod_due" : claimedTrx ? "authorised" : "unpaid",
    trxId: claimedTrx || undefined,
    attribution: (body.attribution as never) ?? ops.state.attribution ?? undefined,
    otpVerified: body.otpVerified === true,
    riskFlags: screenOrder(order, lineItems),
    events: [
      {
        id: ops.uid(),
        at: new Date().toISOString(),
        status: paymentMethod === "cod" || verified ? "confirmed" : "pending",
        label: verified ? "Payment verified" : paymentMethod === "cod" ? "Order confirmed — cash on delivery" : "Awaiting payment confirmation",
        actor: "checkout",
      },
    ],
    notes: [],
  });

  if (promo && discount > 0) ops.recordPromo(promo.code, normalisedPhone);

  /* Any abandoned bag for this number is now a conversion. */
  ops.state.carts
    .filter((cart) => cart.phone.replace(/[\s-]/g, "") === normalisedPhone && !cart.recovered)
    .forEach((cart) => ops.upsertCart({ ...cart, recovered: true }));

  if (settings.notifications.orderConfirmation) queueConfirmation(order.orderNumber);

  return json(
    {
      ok: true,
      orderNumber: order.orderNumber,
      total: order.total,
      shipping: order.shipping,
      discount: order.discount,
      items: lineItems.map((item) => ({ id: item.slug, quantity: item.qty, item_price: item.unitPrice })),
    },
    201,
  );
}

function previewActivity() {
  const entries = [...store.tables.orders]
    .filter((order) => ["confirmed", "packing", "shipped", "delivered"].includes(order.status))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8)
    .flatMap((order) => {
      const item = store.tables.orderItems.find((entry) => entry.orderId === order.id);
      if (!item) return [];
      return [{
        id: `${order.orderNumber}-${item.id}`,
        customer: order.customerName.split(" ")[0],
        district: order.district,
        item: item.name,
        slug: item.slug.startsWith("custom-pack-") ? undefined : item.slug,
        createdAt: order.createdAt.toISOString(),
      }];
    });
  return json({ entries });
}

const VOTE_STORE = "gsbd-preview-review-votes";

function previewVote(reviewId: number, body: Record<string, any>) {
  if (!store.tables.reviews.some((review) => review.id === reviewId)) return json({ error: "Review not found." }, 404);
  const voterKey = String(body.voterKey ?? "");
  if (voterKey.length < 20 || voterKey.length > 120) return json({ error: "Could not verify this browser." }, 400);
  let saved: { voted?: string[]; counts?: Record<string, number> } = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(VOTE_STORE) ?? "{}") as typeof saved;
  } catch {
    saved = {};
  }
  const voted = new Set(saved.voted ?? []);
  const key = `${voterKey}:${reviewId}`;
  const counts = saved.counts ?? {};
  if (!voted.has(key)) {
    voted.add(key);
    counts[reviewId] = (counts[reviewId] ?? 0) + 1;
    try {
      window.localStorage.setItem(VOTE_STORE, JSON.stringify({ voted: [...voted], counts }));
    } catch {
      /* In-memory response still works if storage is blocked. */
    }
  }
  return json({ ok: true, voted: true, helpfulCount: counts[reviewId] ?? 0 });
}

async function route(url: URL, init: RequestInit | undefined, body: Record<string, any> | undefined) {
  const path = url.pathname.replace(/^.*\/api\//, "/api/").replace(/\/+$/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  const voteMatch = /^\/api\/reviews\/(\d+)\/helpful$/.exec(path);
  if (method === "POST" && voteMatch) return previewVote(Number(voteMatch[1]), body ?? {});
  if (method === "POST" && path === "/api/packs/price") {
    try {
      return json({ ok: true, pack: calculatePack((body as Record<string, unknown>)?.configuration ?? body, { products: store.tables.products }), pricedBy: "server" });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid pack configuration." }, 400);
    }
  }

  switch (`${method} ${path}`) {
    case "GET /api/health":
      return json({ ok: true });
    case "GET /api/products/search":
      return searchProducts(url);
    case "GET /api/products/upsell":
      return upsellProducts();
    case "GET /api/activity":
      return previewActivity();
    case "GET /api/orders/track":
      return trackOrder(url);
    case "POST /api/reviews":
      return postReview(body ?? {});
    case "POST /api/orders":
      return postOrder(body ?? {});
    case "POST /api/events":
      /* Preview stand-in for the server-side Conversions API relay. */
      return json({ ok: true, relayed: false, reason: "preview" });
    default:
      return json({ error: "Not found" }, 404);
  }
}

let installed = false;

export function installLocalApi() {
  if (installed || typeof window === "undefined") return;
  if (isLive()) return; // the real server answers /api/* — never intercept
  installed = true;
  const original = window.fetch.bind(window);
  /* file://, about:srcdoc and blob: documents report their origin as the string
     "null", which is not a usable URL base. Resolve against a stand-in origin
     there so relative /api/* calls are still recognised and answered locally. */
  const origin = /^https?:$/.test(window.location.protocol) ? window.location.origin : "http://gsbd.local";

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let url: URL;
    try {
      url = new URL(raw, origin);
    } catch {
      return original(input as RequestInfo, init);
    }

    /* Admin-controlled pack rules are persisted by the real preview server.
       Never shadow this endpoint with the in-memory route table. */
    if (url.origin === origin && url.pathname === "/api/pack-recommendations") {
      return original(input as RequestInfo, init);
    }

    const isApi = url.origin === origin && /(^|\/)api\//.test(url.pathname);
    if (!isApi) return original(input as RequestInfo, init);

    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    let body: Record<string, any> | undefined;
    const rawBody = init?.body;
    if (typeof rawBody === "string") {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return json({ error: "Invalid request body." }, 400);
      }
    } else if (input instanceof Request && input.method.toUpperCase() === "POST") {
      try {
        body = (await input.clone().json()) as Record<string, any>;
      } catch {
        return json({ error: "Invalid request body." }, 400);
      }
    }

    await wait(160 + Math.random() * 140, signal);
    try {
      return await route(url, init, body);
    } catch (error) {
      console.error("[local-api]", error);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}