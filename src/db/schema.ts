import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { PackComponent, PackConfiguration } from "@/lib/pack-builder";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  image: text("image").notNull(),
  icon: text("icon").notNull().default("battery"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    brand: text("brand").notNull(),
    categorySlug: text("category_slug").notNull(),
    shortDescription: text("short_description").notNull(),
    description: text("description").notNull(),
    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    stock: integer("stock").notNull().default(0),
    rating: doublePrecision("rating").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    badge: text("badge"),
    highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
    specs: jsonb("specs")
      .$type<{ label: string; value: string }[]>()
      .notNull()
      .default([]),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    featured: boolean("featured").notNull().default(false),
    warrantyMonths: integer("warranty_months").notNull().default(3),
    sku: text("sku").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("products_category_idx").on(table.categorySlug)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    productSlug: text("product_slug").notNull(),
    author: text("author").notNull(),
    location: text("location").notNull().default("Dhaka"),
    rating: integer("rating").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    verified: boolean("verified").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reviews_product_idx").on(table.productSlug)],
);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  district: text("district").notNull(),
  address: text("address").notNull(),
  notes: text("notes"),
  paymentMethod: text("payment_method").notNull().default("cod"),
  deliveryMethod: text("delivery_method").notNull().default("standard"),
  promoCode: text("promo_code"),
  subtotal: integer("subtotal").notNull(),
  shipping: integer("shipping").notNull(),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull(),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull(),
    productId: integer("product_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    image: text("image").notNull(),
    unitPrice: integer("unit_price").notNull(),
    qty: integer("qty").notNull(),
    packSpec: jsonb("pack_spec").$type<PackConfiguration & { components: PackComponent[] } | null>(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

/* ------------------------------------------------------------------ */
/* Operations tables — added for live trading                          */
/* ------------------------------------------------------------------ */

/** Append-only fulfilment log. Every status change is attributable. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    status: text("status").notNull(),
    label: text("label").notNull(),
    note: text("note"),
    actor: text("actor").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_events_order_idx").on(table.orderNumber)],
);

/** First-touch ad attribution captured at checkout. */
export const orderAttribution = pgTable("order_attribution", {
  orderNumber: text("order_number").primaryKey(),
  source: text("source").notNull().default("direct"),
  medium: text("medium").notNull().default("none"),
  campaign: text("campaign"),
  content: text("content"),
  term: text("term"),
  fbclid: boolean("fbclid").notNull().default(false),
  gclid: boolean("gclid").notNull().default(false),
  ttclid: boolean("ttclid").notNull().default(false),
  landingPage: text("landing_page"),
  referrer: text("referrer"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Payment ledger — one row per gateway attempt, idempotent on reference. */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    orderNumber: text("order_number").notNull(),
    provider: text("provider").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("pending"),
    trxId: text("trx_id"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payments_order_idx").on(table.orderNumber)],
);

/** Outbound customer messages, with delivery state for retries. */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    orderNumber: text("order_number"),
    status: text("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [index("notifications_status_idx").on(table.status)],
);

export const abandonedCarts = pgTable("abandoned_carts", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  customerName: text("customer_name"),
  items: jsonb("items").$type<Array<{ slug: string; name: string; qty: number; price: number }>>().notNull(),
  value: integer("value").notNull(),
  source: text("source"),
  campaign: text("campaign"),
  recovered: boolean("recovered").notNull().default(false),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    phone: text("phone").notNull(),
    orderNumber: text("order_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("promo_phone_idx").on(table.code, table.phone)],
);

export const adSpend = pgTable("ad_spend", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  channel: text("channel").notNull(),
  amount: integer("amount").notNull(),
});

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("operator"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Immutable audit trail for every privileged mutation. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_created_idx").on(table.createdAt)],
);

export type OrderEventRow = typeof orderEvents.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AbandonedCartRow = typeof abandonedCarts.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
