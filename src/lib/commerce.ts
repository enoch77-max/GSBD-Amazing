export const STORE = {
  name: "Glowing Space BD",
  shortName: "Glowing Space",
  tagline: "Serious power for people who build.",
  phone: "+880 1400 788 738",
  whatsapp: "8801400788738",
  email: "hello@glowingspacebd.com",
  address: "Shop 12, Level 2, Mirpur DOHS Shopping Complex, Dhaka 1216",
  hours: "Sat–Thu · 10:00–20:00",
  freeShippingThreshold: 2500,
} as const;

export const DISTRICTS = [
  "Dhaka",
  "Gazipur",
  "Narayanganj",
  "Chattogram",
  "Cumilla",
  "Sylhet",
  "Khulna",
  "Rajshahi",
  "Barishal",
  "Rangpur",
  "Mymensingh",
  "Bogura",
  "Jashore",
  "Cox's Bazar",
  "Noakhali",
  "Feni",
  "Pabna",
  "Tangail",
  "Dinajpur",
  "Patuakhali",
  "Kushtia",
  "Jamalpur",
  "Savar",
  "Other district",
] as const;

export type DeliveryMethod = "standard" | "express";

export const DELIVERY_METHODS: Array<{
  id: DeliveryMethod;
  name: string;
  eta: string;
  priceInside: number;
  priceOutside: number;
  blurb: string;
}> = [
  {
    id: "standard",
    name: "Standard courier",
    eta: "1–2 days inside Dhaka · 2–4 days outside",
    priceInside: 80,
    priceOutside: 130,
    blurb: "Pathao / Steadfast, tracked with SMS updates.",
  },
  {
    id: "express",
    name: "Express same-day",
    eta: "Today before 9 PM (Dhaka Metro only)",
    priceInside: 150,
    priceOutside: 220,
    blurb: "Rider pickup from our Mirpur counter.",
  },
];

export function deliveryPrice(method: DeliveryMethod, district: string): number {
  const option = DELIVERY_METHODS.find((m) => m.id === method) ?? DELIVERY_METHODS[0];
  return district === "Dhaka" ? option.priceInside : option.priceOutside;
}

export type Promo = {
  code: string;
  label: string;
  type: "percent" | "flat" | "shipping";
  value: number;
  minSubtotal: number;
  maxDiscount?: number;
  /** Console-managed controls; absent means "always on, unlimited". */
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  maxUses?: number | null;
};

/** Built-in codes; the merchant console can replace this list at runtime. */
export const DEFAULT_PROMOS: Promo[] = [];

export const PROMOS: Promo[] = [
  {
    code: "GLOW10",
    label: "10% off your order",
    type: "percent",
    value: 10,
    minSubtotal: 1000,
    maxDiscount: 1500,
  },
  {
    code: "FREESHIP",
    label: "Free delivery anywhere in BD",
    type: "shipping",
    value: 0,
    minSubtotal: 800,
  },
  {
    code: "BUILDER300",
    label: "৳300 off orders over ৳5,000",
    type: "flat",
    value: 300,
    minSubtotal: 5000,
  },
];

DEFAULT_PROMOS.push(...PROMOS.map((promo) => ({ ...promo })));

export function promoLive(promo: Promo, now = Date.now()): boolean {
  if (promo.active === false) return false;
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return false;
  if (promo.endsAt && new Date(promo.endsAt).getTime() < now) return false;
  return true;
}

export function findPromo(code: string): Promo | undefined {
  return PROMOS.find((promo) => promo.code === code.trim().toUpperCase() && promoLive(promo));
}

/** Swap the active promo list in place (shared by live sync and the console). */
export function replacePromos(next: Promo[]) {
  PROMOS.length = 0;
  for (const promo of next) PROMOS.push(promo);
}

export function promoDiscount(promo: Promo | undefined, subtotal: number): number {
  if (!promo || subtotal < promo.minSubtotal) return 0;
  if (promo.type === "percent") {
    const raw = Math.round((subtotal * promo.value) / 100);
    return promo.maxDiscount ? Math.min(raw, promo.maxDiscount) : raw;
  }
  if (promo.type === "flat") return Math.min(promo.value, subtotal);
  return 0;
}

export type OrderStatus = "confirmed" | "packing" | "shipped" | "delivered";

export const ORDER_STEPS: Array<{
  id: OrderStatus;
  label: string;
  description: string;
  hint: string;
}> = [
  {
    id: "confirmed",
    label: "Order confirmed",
    description: "We received your order and reserved the stock.",
    hint: "Payment verified",
  },
  {
    id: "packing",
    label: "Packing at the bench",
    description: "Every cell is capacity-checked and the order is boxed with care.",
    hint: "Mirpur workshop",
  },
  {
    id: "shipped",
    label: "Handed to courier",
    description: "Your parcel is on the way with SMS tracking updates.",
    hint: "Pathao / Steadfast",
  },
  {
    id: "delivered",
    label: "Delivered",
    description: "Enjoy the build — reach out any time if you need a hand.",
    hint: "Signed for",
  },
];

export function statusIndex(status: string): number {
  const index = ORDER_STEPS.findIndex((step) => step.id === status);
  return index < 0 ? 0 : index;
}

export const PAYMENT_METHODS = [
  {
    id: "bkash",
    name: "bKash",
    detail: "Send money to 01712-345678, then paste the TrxID.",
    accent: "#E2136E",
  },
  {
    id: "nagad",
    name: "Nagad",
    detail: "Send money to 01712-345678, then paste the TrxID.",
    accent: "#F6921E",
  },
  {
    id: "cod",
    name: "Cash on delivery",
    detail: "Pay the rider in cash. ৳100 advance for orders over ৳15,000.",
    accent: "#132A21",
  },
  {
    id: "card",
    name: "Card / SSLCommerz",
    detail: "Visa, Mastercard, Amex. Secure hosted checkout by SSLCommerz.",
    accent: "#2C6ECB",
  },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

export function shippingEstimate(district: string, method: DeliveryMethod = "standard"): string {
  if (method === "express" && district === "Dhaka") return "Today before 9 PM";
  if (district === "Dhaka") return "Tomorrow, 1–2 days";
  return "2–4 working days";
}
