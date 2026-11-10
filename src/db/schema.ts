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
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
