/**
 * Preview implementation of the storefront query layer.
 *
 * In live deployments the backend (`backend/shop.ts`) serves the same data
 * from PostgreSQL and the storefront syncs it at boot. Every exported
 * signature here is identical, so pages,
 * components and route handlers are unchanged; the browser build simply reads
 * from the seeded in-memory tables in `@/db/local-store`.
 */
import { store } from "@/db/local-store";
import type { Category, Order, OrderItem, Product, Review } from "@/db/schema";
import { PAGE_SIZE, PRICE_RANGES, type SortId } from "./catalog";

export { PAGE_SIZE, PRICE_RANGES, SORT_OPTIONS } from "./catalog";
export type { SortId } from "./catalog";

export type ShopFilters = {
  category?: string;
  brand?: string[];
  price?: string[];
  q?: string;
  sort?: SortId;
  page?: number;
  inStock?: boolean;
};

export type ShopResult = {
  items: Product[];
  total: number;
  page: number;
  pageCount: number;
  brandCounts: Array<{ brand: string; count: number }>;
  categoryCounts: Array<{ slug: string; count: number }>;
};

const byText = (value: string) => value.toLocaleLowerCase();
const includes = (value: string, term: string) => byText(value).includes(byText(term));

function sortProducts(rows: Product[], sort: SortId = "featured"): Product[] {
  const list = [...rows];
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => a.price - b.price);
    case "price-desc":
      return list.sort((a, b) => b.price - a.price);
    case "rating":
      return list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    case "newest":
      return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    default:
      return list.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) || b.rating - a.rating || a.price - b.price,
      );
  }
}

function tally<T extends string>(values: T[], keyOrder: (a: [T, number], b: [T, number]) => number) {
  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort(keyOrder);
}

/* ------------------------------------------------------------------ */
/* Synchronous readers used by the client-rendered pages               */
/* ------------------------------------------------------------------ */

export function readCategories(): Category[] {
  return [...store.tables.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function readCategoryBySlug(slug: string): Category | null {
  return store.tables.categories.find((category) => category.slug === slug) ?? null;
}

export function readCategoryCounts(): Array<{ slug: string; count: number }> {
  return tally(store.tables.products.map((product) => product.categorySlug), (a, b) => a[0].localeCompare(b[0])).map(
    ([slug, count]) => ({ slug, count }),
  );
}

export function readShopProducts(filters: ShopFilters): ShopResult {
  const page = Math.max(1, filters.page ?? 1);
  const { products } = store.tables;

  let rows = products;
  if (filters.category && filters.category !== "all") {
    rows = rows.filter((product) => product.categorySlug === filters.category);
  }
  const categoryScoped = rows;

  if (filters.brand && filters.brand.length > 0) {
    const brands = new Set(filters.brand);
    rows = rows.filter((product) => brands.has(product.brand));
  }
  if (filters.inStock) rows = rows.filter((product) => product.stock > 0);
  if (filters.q && filters.q.trim()) {
    const term = filters.q.trim();
    rows = rows.filter(
      (product) =>
        includes(product.name, term) ||
        includes(product.shortDescription, term) ||
        includes(product.brand, term) ||
        includes(product.description, term),
    );
  }
  if (filters.price && filters.price.length > 0) {
    const ranges = filters.price.map((key) => PRICE_RANGES[key]).filter(Boolean);
    if (ranges.length > 0) {
      rows = rows.filter((product) =>
        ranges.some(
          (range) =>
            (range.min === undefined || product.price >= range.min) &&
            (range.max === undefined || product.price <= range.max),
        ),
      );
    }
  }

  const sorted = sortProducts(rows, filters.sort);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const brandCounts = tally(categoryScoped.map((product) => product.brand), (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(
    ([brand, count]) => ({ brand, count }),
  );

  return {
    items: sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    total,
    page: safePage,
    pageCount,
    brandCounts,
    categoryCounts: readCategoryCounts(),
  };
}

export function readProductBySlug(slug: string): Product | null {
  return store.tables.products.find((product) => product.slug === slug) ?? null;
}

export function readProductReviews(slug: string): Review[] {
  return store.tables.reviews
    .filter((review) => review.productSlug === slug)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function readRelatedProducts(categorySlug: string, excludeSlug: string, limit = 4): Product[] {
  return store.tables.products
    .filter((product) => product.categorySlug === categorySlug && product.slug !== excludeSlug)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

export function readFeaturedProducts(limit = 8): Product[] {
  return store.tables.products
    .filter((product) => product.featured)
    .sort((a, b) => b.rating - a.rating || a.price - b.price)
    .slice(0, limit);
}

export function readNewArrivals(limit = 4): Product[] {
  return [...store.tables.products]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export function readAllProducts(): Product[] {
  return [...store.tables.products].sort((a, b) => a.name.localeCompare(b.name));
}

export function readStorefrontStats() {
  const { products, categories, reviews } = store.tables;
  const avg = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return {
    productCount: products.length,
    categoryCount: categories.length,
    reviewCount: reviews.length,
    avgRating: Math.round(avg * 10) / 10,
  };
}

export function readLatestReviews(limit = 6): Array<Review & { productName: string }> {
  return store.tables.reviews
    .filter((review) => review.rating >= 5)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((review) => ({
      ...review,
      productName: readProductBySlug(review.productSlug)?.name ?? "Glowing Space BD",
    }));
}

export function readOrderByNumber(orderNumber: string): { order: Order; items: OrderItem[] } | null {
  const order = store.tables.orders.find(
    (entry) => entry.orderNumber === orderNumber.trim().toUpperCase(),
  );
  if (!order) return null;
  return { order, items: store.tables.orderItems.filter((item) => item.orderId === order.id) };
}

/* ------------------------------------------------------------------ */
/* Async API — identical to the server implementation                  */
/* ------------------------------------------------------------------ */

export async function getCategoryCounts() {
  return readCategoryCounts();
}

export async function getCategories(): Promise<Category[]> {
  return readCategories();
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return readCategoryBySlug(slug);
}

export async function getShopProducts(filters: ShopFilters): Promise<ShopResult> {
  return readShopProducts(filters);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return readProductBySlug(slug);
}

export async function getProductReviews(slug: string): Promise<Review[]> {
  return readProductReviews(slug);
}

export async function getRelatedProducts(categorySlug: string, excludeSlug: string, limit = 4): Promise<Product[]> {
  return readRelatedProducts(categorySlug, excludeSlug, limit);
}

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  return readFeaturedProducts(limit);
}

export async function getNewArrivals(limit = 4): Promise<Product[]> {
  return readNewArrivals(limit);
}

export async function getAllProducts(): Promise<Product[]> {
  return readAllProducts();
}

export async function getStorefrontStats() {
  return readStorefrontStats();
}

export async function getLatestReviews(limit = 6) {
  return readLatestReviews(limit);
}

export async function recalculateProductRating(slug: string): Promise<void> {
  const rows = store.tables.reviews.filter((review) => review.productSlug === slug);
  const avg = rows.length ? rows.reduce((sum, review) => sum + review.rating, 0) / rows.length : 0;
  store.setProductRating(slug, Math.round(avg * 10) / 10, rows.length);
}

export async function createOrder(input: {
  customerName: string;
  phone: string;
  email?: string | null;
  district: string;
  address: string;
  notes?: string | null;
  paymentMethod: string;
  deliveryMethod: string;
  promoCode?: string | null;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  items: Array<{
    productId: number | null;
    slug: string;
    name: string;
    image: string;
    unitPrice: number;
    qty: number;
    packSpec?: OrderItem["packSpec"];
  }>;
}): Promise<Order> {
  const { items, ...values } = input;
  let orderNumber = `GSBD-${Math.floor(10500 + Math.random() * 89400)}`;
  while (store.tables.orders.some((order) => order.orderNumber === orderNumber)) {
    orderNumber = `GSBD-${Math.floor(10500 + Math.random() * 89400)}`;
  }
  return store.insertOrder(
    {
      ...values,
      email: values.email ?? null,
      notes: values.notes ?? null,
      promoCode: values.promoCode ?? null,
      orderNumber,
      status: "confirmed",
    },
    items.map((item) => ({ ...item, packSpec: item.packSpec ?? null })),
  );
}

export async function getOrderByNumber(orderNumber: string) {
  return readOrderByNumber(orderNumber);
}