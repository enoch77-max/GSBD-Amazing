/**
 * Browser persistence layer for the static preview build.
 *
 * The production app (see `backend/` for the production server)
 * talks to PostgreSQL through Drizzle. This module keeps the exact same table
 * shapes and the exact same seed records, but holds them in memory and mirrors
 * every mutation into localStorage so the deployed preview stays fully
 * interactive: reviews post, orders place, tracking lookups resolve.
 */
import type { Category, Order, OrderItem, Product, Review } from "./schema";
import { buildProductSeeds, buildReviewSeeds, categorySeeds, orderSeeds } from "./seed-data";

const STORAGE_KEY = "gsbd.storefront.v1";

type Snapshot = {
  categories: Category[];
  products: Product[];
  reviews: Review[];
  orders: Order[];
  orderItems: OrderItem[];
};

/** Every merchant-editable product field. `slug`, `id` and `createdAt` are identity. */
export const EDITABLE_PRODUCT_FIELDS = [
  "name", "brand", "categorySlug", "shortDescription", "description", "price", "compareAtPrice", "stock",
  "badge", "highlights", "specs", "images", "featured", "warrantyMonths", "sku",
] as const;
export type ProductPatch = Partial<Pick<Product, (typeof EDITABLE_PRODUCT_FIELDS)[number]>>;
export type ProductInput = Omit<Product, "id" | "createdAt"> & { createdAt?: Date };
/** Admin view of a product: includes hidden listings. */
export type ManagedProduct = Product & { visible: boolean; custom: boolean };

type Persisted = {
  productPatches: Record<string, ProductPatch>;
  /** Products created in the console (seed products are restored from code). */
  customProducts?: Array<Omit<Product, "createdAt"> & { createdAt: string }>;
  deletedSlugs?: string[];
  hiddenSlugs?: string[];
  hiddenReviewKeys?: string[];
  reviews: Review[];
  orders: Order[];
  orderItems: OrderItem[];
  ratings: Record<string, { rating: number; reviewCount: number }>;
};

function buildSeedState(): Snapshot {
  const categories: Category[] = categorySeeds.map((seed, index) => ({
    id: index + 1,
    slug: seed.slug,
    name: seed.name,
    tagline: seed.tagline,
    description: seed.description,
    image: seed.image,
    icon: seed.icon ?? "battery",
    sortOrder: seed.sortOrder ?? index + 1,
  }));

  const products: Product[] = buildProductSeeds().map((seed, index) => ({
    id: index + 1,
    slug: seed.slug,
    name: seed.name,
    brand: seed.brand,
    categorySlug: seed.categorySlug,
    shortDescription: seed.shortDescription,
    description: seed.description,
    price: seed.price,
    compareAtPrice: seed.compareAtPrice ?? null,
    stock: seed.stock ?? 0,
    rating: seed.rating ?? 0,
    reviewCount: seed.reviewCount ?? 0,
    badge: seed.badge ?? null,
    highlights: seed.highlights ?? [],
    specs: seed.specs ?? [],
    images: seed.images ?? [],
    featured: seed.featured ?? false,
    warrantyMonths: seed.warrantyMonths ?? 3,
    sku: seed.sku,
    createdAt: seed.createdAt ?? new Date(),
  }));

  const reviews: Review[] = buildReviewSeeds().map((seed, index) => ({
    id: index + 1,
    productSlug: seed.productSlug,
    author: seed.author,
    location: seed.location ?? "Dhaka",
    rating: seed.rating,
    title: seed.title,
    body: seed.body,
    verified: seed.verified ?? true,
    createdAt: (seed as { createdAt?: Date }).createdAt ?? new Date(Date.now() - seed.daysAgo * 86400000),
  }));

  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  let itemId = 1;

  orderSeeds.forEach((seed, index) => {
    const { daysAgo, ...values } = seed.order;
    const id = index + 1;
    orders.push({
      id,
      orderNumber: values.orderNumber,
      customerName: values.customerName,
      phone: values.phone,
      email: values.email ?? null,
      district: values.district,
      address: values.address,
      notes: values.notes ?? null,
      paymentMethod: values.paymentMethod ?? "cod",
      deliveryMethod: values.deliveryMethod ?? "standard",
      promoCode: values.promoCode ?? null,
      subtotal: values.subtotal,
      shipping: values.shipping,
      discount: values.discount ?? 0,
      total: values.total,
      status: values.status ?? "confirmed",
      createdAt: new Date(Date.now() - daysAgo * 86400000),
    });
    seed.items.forEach((item) => {
      orderItems.push({
        id: itemId++,
        orderId: id,
        productId: item.productId ?? null,
        slug: item.slug,
        name: item.name,
        image: item.image,
        unitPrice: item.unitPrice,
        qty: item.qty,
        packSpec: null,
      });
    });
  });

  return { categories, products, reviews, orders, orderItems };
}

const seedState = buildSeedState();
const seedReviewCount = seedState.reviews.length;
const seedOrderCount = seedState.orders.length;

function reviveDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** Listings hidden from the storefront, pack builder and checkout. */
let hidden = new Set<string>();
/** Reviews hidden by moderation, keyed stably (ids can be renumbered on hydrate). */
let hiddenReviews = new Set<string>();
export const reviewKey = (review: Pick<Review, "productSlug" | "author" | "createdAt">) =>
  `${review.productSlug}|${review.author}|${new Date(review.createdAt).getTime()}`;

const isText = (value: unknown): value is string => typeof value === "string";
const isCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Old or hand-edited storage must never corrupt the catalogue. */
function sanitizePatch(patch: Record<string, unknown>): ProductPatch {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_PRODUCT_FIELDS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    switch (key) {
      case "price": case "stock": case "warrantyMonths":
        if (isCount(value)) out[key] = Math.round(value as number);
        break;
      case "compareAtPrice":
        if (value === null || isCount(value)) out[key] = value === null ? null : Math.round(value as number);
        break;
      case "badge":
        if (value === null || isText(value)) out[key] = value;
        break;
      case "featured":
        if (typeof value === "boolean") out[key] = value;
        break;
      case "highlights": case "images":
        if (Array.isArray(value)) out[key] = value.filter(isText);
        break;
      case "specs":
        if (Array.isArray(value)) out[key] = value.filter((spec) => spec && isText(spec.label) && isText(spec.value)).map((spec) => ({ label: spec.label, value: spec.value }));
        break;
      default:
        if (isText(value)) out[key] = value;
    }
  }
  return out as ProductPatch;
}

function hydrate(): Snapshot {
  const state: Snapshot = {
    categories: seedState.categories,
    products: seedState.products.map((product) => ({ ...product })),
    reviews: seedState.reviews.map((review) => ({ ...review })),
    orders: seedState.orders.map((order) => ({ ...order })),
    orderItems: seedState.orderItems.map((item) => ({ ...item })),
  };

  if (typeof window === "undefined") return state;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return state;
    const saved = JSON.parse(raw) as Partial<Persisted>;

    if (Array.isArray(saved.reviews)) {
      const extra = saved.reviews
        .slice(seedReviewCount)
        .filter((review) => review && typeof review.productSlug === "string")
        .map((review, index) => ({ ...review, id: seedReviewCount + index + 1, createdAt: reviveDate(review.createdAt) }));
      state.reviews.push(...extra);
    }

    if (Array.isArray(saved.orders) && Array.isArray(saved.orderItems)) {
      const extraOrders = saved.orders.slice(seedOrderCount).filter((order) => order && typeof order.orderNumber === "string");
      const offset = state.orders.length;
      extraOrders.forEach((order, index) => {
        const id = offset + index + 1;
        state.orders.push({ ...order, id, createdAt: reviveDate(order.createdAt) });
        saved.orderItems
          ?.filter((item) => item.orderId === order.id)
          .forEach((item, itemIndex) => {
            state.orderItems.push({ ...item, id: state.orderItems.length + itemIndex + 1, orderId: id });
          });
      });
    }

    if (saved.productPatches) {
      state.products = state.products.map((product) => {
        const patch = saved.productPatches?.[product.slug];
        return patch ? { ...product, ...sanitizePatch(patch) } : product;
      });
    }

    if (Array.isArray(saved.deletedSlugs)) {
      const deleted = new Set(saved.deletedSlugs.filter((slug) => typeof slug === "string"));
      state.products = state.products.filter((product) => !deleted.has(product.slug));
    }

    if (Array.isArray(saved.customProducts)) {
      const taken = new Set(state.products.map((product) => product.slug));
      for (const entry of saved.customProducts) {
        if (!entry || typeof entry.slug !== "string" || taken.has(entry.slug) || typeof entry.name !== "string") continue;
        taken.add(entry.slug);
        state.products.push({ ...entry, ...sanitizePatch(entry), createdAt: reviveDate(entry.createdAt) } as Product);
      }
      state.products = state.products.map((product, index) => ({ ...product, id: index + 1 }));
    }

    if (Array.isArray(saved.hiddenReviewKeys)) {
      hiddenReviews = new Set(saved.hiddenReviewKeys.filter((key) => typeof key === "string"));
    }

    if (Array.isArray(saved.hiddenSlugs)) {
      hidden = new Set(saved.hiddenSlugs.filter((slug) => typeof slug === "string"));
    }

    if (saved.ratings) {
      state.products = state.products.map((product) => {
        const rating = saved.ratings?.[product.slug];
        return rating ? { ...product, rating: rating.rating, reviewCount: rating.reviewCount } : product;
      });
    }
  } catch (error) {
    console.warn("[local-store] could not restore saved state", error);
  }

  return state;
}

let state = hydrate();
let version = 0;
let persistError: string | null = null;
let visibleTables: Snapshot = withVisibleProducts(state);

function withVisibleProducts(snapshot: Snapshot): Snapshot {
  if (!hidden.size && !hiddenReviews.size) return snapshot;
  return {
    ...snapshot,
    products: hidden.size ? snapshot.products.filter((product) => !hidden.has(product.slug)) : snapshot.products,
    reviews: hiddenReviews.size ? snapshot.reviews.filter((review) => !hiddenReviews.has(reviewKey(review))) : snapshot.reviews,
  };
}
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    const ratings: Persisted["ratings"] = {};
    state.products.forEach((product) => {
      const seed = seedState.products.find((entry) => entry.slug === product.slug);
      if (seed && (seed.rating !== product.rating || seed.reviewCount !== product.reviewCount)) {
        ratings[product.slug] = { rating: product.rating, reviewCount: product.reviewCount };
      }
    });
    const productPatches: Persisted["productPatches"] = {};
    const customProducts: NonNullable<Persisted["customProducts"]> = [];
    const live = new Set(state.products.map((product) => product.slug));
    state.products.forEach((product) => {
      const seed = seedState.products.find((entry) => entry.slug === product.slug);
      if (!seed) {
        customProducts.push({ ...product, createdAt: product.createdAt.toISOString() });
        return;
      }
      const patch: Record<string, unknown> = {};
      for (const key of EDITABLE_PRODUCT_FIELDS) {
        if (JSON.stringify(seed[key]) !== JSON.stringify(product[key])) patch[key] = product[key];
      }
      if (Object.keys(patch).length) productPatches[product.slug] = patch as ProductPatch;
    });
    const deletedSlugs = seedState.products.filter((product) => !live.has(product.slug)).map((product) => product.slug);
    const payload: Persisted = {
      productPatches,
      customProducts,
      deletedSlugs,
      hiddenSlugs: [...hidden].filter((slug) => live.has(slug)),
      hiddenReviewKeys: [...hiddenReviews],
      reviews: state.reviews,
      orders: state.orders,
      orderItems: state.orderItems,
      ratings,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    persistError = null;
  } catch (error) {
    persistError = error instanceof DOMException && /quota/i.test(error.name + error.message)
      ? "Browser storage is full. Remove large uploaded images, then save again."
      : "Changes could not be saved in this browser.";
    console.warn("[local-store] could not persist state", error);
  }
}

function commit() {
  visibleTables = withVisibleProducts(state);
  version += 1;
  persist();
  listeners.forEach((listener) => listener());
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getVersion() {
    return version;
  },
  /** Storefront view: hidden listings are excluded everywhere customers can reach. */
  get tables(): Snapshot {
    return visibleTables;
  },
  /** Last localStorage write failure, so the console never reports a false save. */
  persistError(): string | null {
    return persistError;
  },
  /** Merchant view: every listing, including hidden ones. */
  allProducts(): ManagedProduct[] {
    const seeds = new Set(seedState.products.map((product) => product.slug));
    return state.products.map((product) => ({ ...product, visible: !hidden.has(product.slug), custom: !seeds.has(product.slug) }));
  },
  /** Moderation view: every review with its visibility. */
  allReviews(): Array<Review & { visible: boolean; key: string }> {
    return state.reviews.map((review) => ({ ...review, key: reviewKey(review), visible: !hiddenReviews.has(reviewKey(review)) }));
  },
  setReviewVisible(key: string, visible: boolean) {
    if (visible) hiddenReviews.delete(key);
    else hiddenReviews.add(key);
    commit();
  },
  findAnyProduct(slug: string): Product | null {
    return state.products.find((product) => product.slug === slug) ?? null;
  },
  isSeedProduct(slug: string): boolean {
    return seedState.products.some((product) => product.slug === slug);
  },
  /** Creates a listing. Returns an error message instead of throwing. */
  createProduct(input: ProductInput): { ok: true; product: Product } | { ok: false; error: string } {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return { ok: false, error: "The URL slug can use lowercase letters, numbers and single dashes." };
    if (state.products.some((product) => product.slug === slug)) return { ok: false, error: "Another product already uses this URL slug." };
    if (seedState.products.some((product) => product.slug === slug)) return { ok: false, error: "This slug belongs to a deleted built-in product. Restore it or choose another slug." };
    const product: Product = { ...input, ...sanitizePatch(input as unknown as Record<string, unknown>), slug, id: store.nextId(state.products), createdAt: input.createdAt ?? new Date() } as Product;
    state = { ...state, products: [...state.products, product] };
    commit();
    return { ok: true, product };
  },
  /** Full merchant edit of an existing listing (identity fields are immutable). */
  updateProduct(slug: string, patch: ProductPatch): Product | null {
    const clean = sanitizePatch(patch as Record<string, unknown>);
    let updated: Product | null = null;
    state = { ...state, products: state.products.map((product) => {
      if (product.slug !== slug) return product;
      updated = { ...product, ...clean };
      return updated;
    }) };
    if (updated) commit();
    return updated;
  },
  setProductVisible(slug: string, visible: boolean) {
    if (!state.products.some((product) => product.slug === slug)) return;
    if (visible) hidden.delete(slug);
    else hidden.add(slug);
    commit();
  },
  deleteProduct(slug: string): boolean {
    if (!state.products.some((product) => product.slug === slug)) return false;
    state = { ...state, products: state.products.filter((product) => product.slug !== slug) };
    hidden.delete(slug);
    commit();
    return true;
  },
  /** Brings back a built-in product that was deleted, in its original state. */
  restoreSeedProduct(slug: string): boolean {
    const seed = seedState.products.find((product) => product.slug === slug);
    if (!seed || state.products.some((product) => product.slug === slug)) return false;
    state = { ...state, products: [...state.products, { ...seed, id: store.nextId(state.products) }] };
    commit();
    return true;
  },
  deletedSeedProducts(): Product[] {
    const live = new Set(state.products.map((product) => product.slug));
    return seedState.products.filter((product) => !live.has(product.slug));
  },
  nextId(rows: Array<{ id: number }>) {
    return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  },
  insertReview(values: Omit<Review, "id" | "createdAt"> & { createdAt?: Date }): Review {
    const review: Review = {
      ...values,
      id: store.nextId(state.reviews),
      createdAt: values.createdAt ?? new Date(),
    };
    state = { ...state, reviews: [...state.reviews, review] };
    commit();
    return review;
  },
  /** Merchant edits to the catalogue (price, stock, featuring). Persisted as deltas. */
  patchProduct(slug: string, patch: ProductPatch) {
    const clean = sanitizePatch(patch as Record<string, unknown>);
    state = {
      ...state,
      products: state.products.map((product) => (product.slug === slug ? { ...product, ...clean } : product)),
    };
    commit();
  },
  setProductRating(slug: string, rating: number, reviewCount: number) {
    state = {
      ...state,
      products: state.products.map((product) =>
        product.slug === slug ? { ...product, rating, reviewCount } : product,
      ),
    };
    commit();
  },
  insertOrder(
    values: Omit<Order, "id" | "createdAt"> & { createdAt?: Date },
    items: Array<Omit<OrderItem, "id" | "orderId">>,
  ): Order {
    const order: Order = {
      ...values,
      id: store.nextId(state.orders),
      createdAt: values.createdAt ?? new Date(),
    };
    let itemId = store.nextId(state.orderItems);
    const rows: OrderItem[] = items.map((item) => ({ ...item, id: itemId++, orderId: order.id }));
    state = { ...state, orders: [...state.orders, order], orderItems: [...state.orderItems, ...rows] };
    commit();
    return order;
  },
  /** Live mode: swaps the catalogue for the server's, without persisting (the DB owns it). */
  replaceCatalog(products: Product[], categories: Category[]) {
    state = { ...state, products, categories };
    hidden = new Set(products.filter((product) => (product as Product & { visible?: boolean }).visible === false).map((product) => product.slug));
    visibleTables = withVisibleProducts(state);
    version += 1;
    listeners.forEach((listener) => listener());
  },
  reset() {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    state = {
      categories: seedState.categories,
      products: seedState.products.map((product) => ({ ...product })),
      reviews: seedState.reviews.map((review) => ({ ...review })),
      orders: seedState.orders.map((order) => ({ ...order })),
      orderItems: seedState.orderItems.map((item) => ({ ...item })),
    };
    hidden = new Set();
    visibleTables = withVisibleProducts(state);
    version += 1;
    listeners.forEach((listener) => listener());
  },
};