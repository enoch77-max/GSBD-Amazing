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

export type ProductPatch = Partial<Pick<Product, "price" | "compareAtPrice" | "stock" | "featured" | "badge">>;

type Persisted = {
  productPatches: Record<string, ProductPatch>;
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
        return patch ? { ...product, ...patch } : product;
      });
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
    state.products.forEach((product) => {
      const seed = seedState.products.find((entry) => entry.slug === product.slug);
      if (!seed) return;
      const patch: ProductPatch = {};
      if (seed.price !== product.price) patch.price = product.price;
      if (seed.compareAtPrice !== product.compareAtPrice) patch.compareAtPrice = product.compareAtPrice;
      if (seed.stock !== product.stock) patch.stock = product.stock;
      if (seed.featured !== product.featured) patch.featured = product.featured;
      if (Object.keys(patch).length) productPatches[product.slug] = patch;
    });
    const payload: Persisted = {
      productPatches,
      reviews: state.reviews,
      orders: state.orders,
      orderItems: state.orderItems,
      ratings,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[local-store] could not persist state", error);
  }
}

function commit() {
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
  get tables(): Snapshot {
    return state;
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
    state = {
      ...state,
      products: state.products.map((product) => (product.slug === slug ? { ...product, ...patch } : product)),
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
    version += 1;
    listeners.forEach((listener) => listener());
  },
};