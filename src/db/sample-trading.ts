/**
 * Deterministic sample trading history.
 *
 * A merchant console is only legible when it has a book of business behind it.
 * This generates ~6 weeks of plausible orders for the real catalogue — correct
 * BDT pricing, district mix, COD/prepaid split, fulfilment ages and ad
 * attribution — so revenue, ROAS, repeat-buyer and stock reports are meaningful
 * the moment the console is opened.
 *
 * Sample rows are kept OUT of the storefront tables and are labelled in the UI.
 * Settings → Danger zone clears them permanently; real orders are never touched.
 */
import type { Order, OrderItem } from "./schema";
import type { Attribution, OrderEvent, OrderPatch, OrderStatus, PaymentStatus } from "./ops-store";
import { buildProductSeeds } from "./seed-data";
import { deliveryPrice } from "@/lib/commerce";

/** Mulberry32 — small, fast, and stable across reloads so figures never jump. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Tanvir", "Nusrat", "Rakib", "Sadia", "Mehedi", "Farhana", "Imran", "Jannatul", "Shakib", "Ayesha", "Rifat", "Mahmuda", "Sabbir", "Tasnim", "Arif", "Sharmin", "Naim", "Priya", "Hasib", "Rumana", "Fahim", "Lamia", "Sohel", "Nadia"];
const LAST = ["Ahmed", "Jahan", "Hasan", "Islam", "Rahman", "Chowdhury", "Karim", "Sultana", "Hossain", "Akter", "Mahmud", "Bhuiyan", "Sarker", "Molla"];

const DISTRICT_WEIGHTS: Array<[string, number]> = [
  ["Dhaka", 52], ["Chattogram", 11], ["Gazipur", 7], ["Narayanganj", 5], ["Sylhet", 5],
  ["Khulna", 4], ["Rajshahi", 4], ["Cumilla", 3], ["Bogura", 3], ["Mymensingh", 2],
  ["Rangpur", 2], ["Barishal", 1], ["Jashore", 1],
];

const AREAS: Record<string, string[]> = {
  Dhaka: ["Mirpur DOHS", "Banani", "Uttara Sector 7", "Dhanmondi 27", "Mohakhali", "Bashundhara R/A", "Mohammadpur", "Badda"],
  Chattogram: ["Agrabad", "GEC Circle", "Halishahar", "Panchlaish"],
  Gazipur: ["Tongi", "Board Bazar", "Chandana Chowrasta"],
  Narayanganj: ["Chashara", "Fatullah", "Siddhirganj"],
  Sylhet: ["Zindabazar", "Amberkhana", "Shibganj"],
  Khulna: ["Sonadanga", "Khalishpur", "Boyra"],
  Rajshahi: ["Shaheb Bazar", "Uposhohor"],
  Cumilla: ["Kandirpar", "Tomsom Bridge"],
  Bogura: ["Sherpur Road", "Sat Matha"],
  Mymensingh: ["Ganginar Par", "Charpara"],
  Rangpur: ["Dhap", "Jahaj Company"],
  Barishal: ["Sadar Road", "Rupatoli"],
  Jashore: ["Chanchra", "Puratan Kasba"],
};

const CHANNELS: Array<{ source: string; medium: string; campaign: string; content: string; weight: number; flag: "fbclid" | "gclid" | "ttclid" | null }> = [
  { source: "facebook", medium: "paid_social", campaign: "router-ups-loadshedding", content: "video-blackout-hook", weight: 30, flag: "fbclid" },
  { source: "facebook", medium: "paid_social", campaign: "18650-tested-cells", content: "carousel-capacity-proof", weight: 20, flag: "fbclid" },
  { source: "google", medium: "cpc", campaign: "search-bms-bd", content: "rsa-exact", weight: 16, flag: "gclid" },
  { source: "tiktok", medium: "paid_social", campaign: "diy-pack-build", content: "ugc-spotweld", weight: 8, flag: "ttclid" },
  { source: "google", medium: "organic", campaign: "(not set)", content: "(not set)", weight: 12, flag: null },
  { source: "direct", medium: "none", campaign: "(not set)", content: "(not set)", weight: 9, flag: null },
  { source: "whatsapp", medium: "referral", campaign: "repeat-customers", content: "broadcast", weight: 5, flag: null },
];

const NOTES = [
  "", "", "",
  "Please call before delivery.",
  "Leave with the guard if I am out.",
  "Need the batch test report with the cells.",
  "Deliver after 5 PM please.",
];

function weighted<T>(items: Array<[T, number]>, roll: number): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = roll * total;
  for (const [value, weight] of items) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return items[0][0];
}

export type SampleTrading = {
  orders: Order[];
  items: OrderItem[];
  patches: Record<string, OrderPatch>;
};

let cache: SampleTrading | null = null;

export function sampleTrading(): SampleTrading {
  if (cache) return cache;

  const random = rng(20260214);
  const catalogue = buildProductSeeds()
    .map((seed, index) => ({
      id: index + 1,
      slug: seed.slug,
      name: seed.name,
      price: seed.price,
      image: seed.images?.[0] ?? "/images/col-cells.jpg",
      category: seed.categorySlug,
    }))
    /* The bespoke pack-building service is quoted, not bought off the shelf. */
    .filter((product) => product.slug !== "custom-battery-pack-service");

  /* Cheap accessories sell more often than inverters — weight by inverse price. */
  const productWeights: Array<[typeof catalogue[number], number]> = catalogue.map((product) => [
    product,
    Math.max(1, Math.round(2600 / Math.sqrt(product.price))),
  ]);

  const orders: Order[] = [];
  const items: OrderItem[] = [];
  const patches: Record<string, OrderPatch> = {};

  let orderId = 9000;
  let itemId = 90000;
  const now = Date.now();
  const DAYS = 42;

  for (let day = DAYS - 1; day >= 0; day -= 1) {
    const date = new Date(now - day * 86400000);
    const weekday = date.getDay();
    /* Friday is the weekend; payday week runs hotter; gentle growth over time. */
    const trend = 1 + (DAYS - day) / DAYS * 0.55;
    const seasonal = weekday === 5 ? 0.45 : weekday === 6 ? 1.2 : 1;
    const payday = date.getDate() <= 7 ? 1.25 : 1;
    const expected = 3.6 * trend * seasonal * payday;
    const count = Math.max(0, Math.round(expected + (random() - 0.5) * 2.2));

    for (let index = 0; index < count; index += 1) {
      orderId += 1;
      const orderNumber = `GSBD-${orderId}`;
      const createdAt = new Date(date.getTime());
      createdAt.setHours(9 + Math.floor(random() * 12), Math.floor(random() * 60), 0, 0);
      if (createdAt.getTime() > now) createdAt.setTime(now - Math.floor(random() * 3600000));

      const district = weighted(DISTRICT_WEIGHTS, random());
      const areas = AREAS[district] ?? ["Sadar"];
      const area = areas[Math.floor(random() * areas.length)];
      const name = `${FIRST[Math.floor(random() * FIRST.length)]} ${LAST[Math.floor(random() * LAST.length)]}`;
      const phone = `01${[3, 4, 5, 6, 7, 8, 9][Math.floor(random() * 7)]}${String(Math.floor(random() * 100000000)).padStart(8, "0")}`;

      const channel = weighted(CHANNELS.map((entry) => [entry, entry.weight] as [typeof entry, number]), random());
      const paymentRoll = random();
      const paymentMethod = paymentRoll < 0.6 ? "cod" : paymentRoll < 0.82 ? "bkash" : paymentRoll < 0.92 ? "nagad" : "card";
      const deliveryMethod = district === "Dhaka" && random() < 0.22 ? "express" : "standard";

      const lineCount = random() < 0.55 ? 1 : random() < 0.85 ? 2 : 3;
      const chosen = new Set<string>();
      let subtotal = 0;
      const lines: OrderItem[] = [];
      for (let line = 0; line < lineCount; line += 1) {
        const product = weighted(productWeights, random());
        if (chosen.has(product.slug)) continue;
        chosen.add(product.slug);
        const qty = product.price < 700 ? 1 + Math.floor(random() * 6) : product.price < 2200 ? 1 + Math.floor(random() * 2) : 1;
        itemId += 1;
        lines.push({
          id: itemId,
          orderId,
          productId: product.id,
          slug: product.slug,
          name: product.name,
          image: product.image,
          unitPrice: product.price,
          qty,
          packSpec: null,
        });
        subtotal += product.price * qty;
      }
      if (lines.length === 0) continue;

      let shipping = deliveryPrice(deliveryMethod as "standard" | "express", district);
      if (deliveryMethod === "standard" && subtotal >= 2500) shipping = 0;
      const promoUsed = random() < 0.18 && subtotal >= 1000;
      const discount = promoUsed ? Math.min(1500, Math.round(subtotal * 0.1)) : 0;
      const total = Math.max(0, subtotal + shipping - discount);

      /* Older parcels have progressed further; a realistic slice fails delivery. */
      const ageDays = (now - createdAt.getTime()) / 86400000;
      const fate = random();
      let status: OrderStatus;
      if (ageDays > 6) status = fate < 0.9 ? "delivered" : fate < 0.965 ? "returned" : "cancelled";
      else if (ageDays > 3) status = fate < 0.72 ? "delivered" : fate < 0.9 ? "shipped" : fate < 0.96 ? "packing" : "cancelled";
      else if (ageDays > 1.2) status = fate < 0.42 ? "shipped" : fate < 0.78 ? "packing" : fate < 0.94 ? "confirmed" : "cancelled";
      else status = fate < 0.34 ? "confirmed" : fate < 0.6 ? "packing" : fate < 0.78 ? "shipped" : fate < 0.94 ? "pending" : "cancelled";

      const paymentStatus: PaymentStatus =
        status === "returned" ? "refunded"
          : paymentMethod === "cod" ? (status === "delivered" ? "paid" : status === "cancelled" ? "unpaid" : "cod_due")
            : status === "pending" ? "authorised" : "paid";

      orders.push({
        id: orderId,
        orderNumber,
        customerName: name,
        phone,
        email: random() < 0.3 ? `${name.split(" ")[0].toLowerCase()}${Math.floor(random() * 90 + 10)}@example.com` : null,
        district,
        address: `House ${1 + Math.floor(random() * 90)}, Road ${1 + Math.floor(random() * 20)}, ${area}, ${district}`,
        notes: NOTES[Math.floor(random() * NOTES.length)] || null,
        paymentMethod,
        deliveryMethod,
        promoCode: promoUsed ? "GLOW10" : null,
        subtotal,
        shipping,
        discount,
        total,
        status,
        createdAt,
      });
      items.push(...lines);

      const flow: OrderStatus[] = ["confirmed", "packing", "shipped", "delivered"];
      const reached = flow.indexOf(status);
      const steps: OrderStatus[] =
        status === "cancelled" ? ["confirmed", "cancelled"]
          : status === "returned" ? [...flow, "returned"]
            : status === "pending" ? ["pending"]
              : flow.slice(0, reached + 1);

      const events: OrderEvent[] = steps.map((step, stepIndex) => ({
        id: `${orderNumber}-${stepIndex}`,
        at: new Date(createdAt.getTime() + stepIndex * 9 * 3600000).toISOString(),
        status: step,
        label:
          step === "pending" ? "Awaiting payment confirmation"
            : step === "confirmed" ? "Order confirmed"
              : step === "packing" ? "Packing at the bench"
                : step === "shipped" ? "Handed to courier"
                  : step === "delivered" ? "Delivered"
                    : step === "cancelled" ? "Order cancelled" : "Returned to shop",
        actor: stepIndex === 0 ? "checkout" : "admin",
      }));

      const attribution: Attribution = {
        source: channel.source,
        medium: channel.medium,
        campaign: channel.campaign,
        content: channel.content,
        term: channel.flag === "gclid" ? "bms board bangladesh" : "(not set)",
        fbclid: channel.flag === "fbclid",
        gclid: channel.flag === "gclid",
        ttclid: channel.flag === "ttclid",
        landingPage: random() < 0.5 ? "/" : `/product/${lines[0].slug}`,
        referrer: channel.source === "facebook" ? "https://facebook.com/" : channel.source === "google" ? "https://google.com/" : "",
        firstSeen: createdAt.toISOString(),
        sessionId: `s${orderId}`,
      };

      patches[orderNumber] = {
        status,
        paymentStatus,
        trxId: paymentMethod === "cod" ? undefined : `${paymentMethod.slice(0, 2).toUpperCase()}${String(Math.floor(random() * 1e9)).padStart(9, "0")}`,
        events,
        notes: [],
        riskFlags: [],
        attribution,
        courier:
          status === "shipped" || status === "delivered" || status === "returned"
            ? {
                provider: random() < 0.6 ? "Pathao" : "Steadfast",
                consignmentId: `${random() < 0.6 ? "PT" : "SF"}${Math.floor(100000 + random() * 899999)}`,
                trackingUrl: "",
                bookedAt: new Date(createdAt.getTime() + 18 * 3600000).toISOString(),
              }
            : undefined,
      };
    }
  }

  cache = { orders, items, patches };
  return cache;
}

/** Spend that lines up with the generated volume, so ROAS reads realistically. */
export function sampleSpend(): Array<{ date: string; channel: string; amount: number }> {
  const random = rng(778899);
  const rows: Array<{ date: string; channel: string; amount: number }> = [];
  const today = new Date();
  for (let day = 41; day >= 0; day -= 1) {
    const date = new Date(today.getTime() - day * 86400000);
    const key = date.toISOString().slice(0, 10);
    const weekday = date.getDay();
    const scale = (weekday === 5 ? 0.5 : 1) * (1 + (41 - day) / 41 * 0.4);
    rows.push({ date: key, channel: "meta", amount: Math.round((4900 + random() * 1200) * scale) });
    rows.push({ date: key, channel: "google", amount: Math.round((1680 + random() * 520) * scale) });
    if (day % 2 === 0) rows.push({ date: key, channel: "tiktok", amount: Math.round((760 + random() * 420) * scale) });
  }
  return rows;
}

export function isSampleOrder(orderNumber: string): boolean {
  return orderNumber in sampleTrading().patches;
}
