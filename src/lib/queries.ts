import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, orderItems, orders, products, reviews } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
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

async function ready() {
  await ensureSeeded();
}

export async function getCategoryCounts(): Promise<Array<{ slug: string; count: number }>> {
  try {
    await ready();
    return await db
      .select({ slug: products.categorySlug, count: sql<number>`count(*)::int` })
      .from(products)
      .groupBy(products.categorySlug);
  } catch (error) {
    console.error("[queries] getCategoryCounts", error);
    return [];
  }
}

export async function getCategories(): Promise<Category[]> {
  try {
    await ready();
    return await db.select().from(categories).orderBy(asc(categories.sortOrder));
  } catch (error) {
    console.error("[queries] getCategories", error);
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  try {
    await ready();
    const [row] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[queries] getCategoryBySlug", error);
    return null;
  }
}

function sortClause(sort: SortId = "featured") {
  switch (sort) {
    case "price-asc":
      return [asc(products.price)];
    case "price-desc":
      return [desc(products.price)];
    case "rating":
      return [desc(products.rating), desc(products.reviewCount)];
    case "newest":
      return [desc(products.createdAt)];
    default:
      return [desc(products.featured), desc(products.rating), asc(products.price)];
  }
}

export async function getShopProducts(filters: ShopFilters): Promise<ShopResult> {
  const page = Math.max(1, filters.page ?? 1);
  const empty: ShopResult = {
    items: [],
    total: 0,
    page,
    pageCount: 1,
    brandCounts: [],
    categoryCounts: [],
  };

  try {
    await ready();

    const conditions: SQL[] = [];
    if (filters.category && filters.category !== "all") {
      conditions.push(eq(products.categorySlug, filters.category));
    }
    if (filters.brand && filters.brand.length > 0) {
      conditions.push(inArray(products.brand, filters.brand));
    }
    if (filters.inStock) {
      conditions.push(sql`${products.stock} > 0`);
    }
    if (filters.q) {
      const term = `%${filters.q.trim()}%`;
      const search = or(
        ilike(products.name, term),
        ilike(products.shortDescription, term),
        ilike(products.brand, term),
        ilike(products.description, term),
      );
      if (search) conditions.push(search);
    }
    if (filters.price && filters.price.length > 0) {
      const rangeConditions = filters.price
        .map((key) => PRICE_RANGES[key])
        .filter(Boolean)
        .map((range) =>
          and(
            range.min !== undefined ? gte(products.price, range.min) : undefined,
            range.max !== undefined ? lte(products.price, range.max) : undefined,
          ),
        )
        .filter((value): value is SQL => Boolean(value));
      if (rangeConditions.length > 0) {
        const combined = or(...rangeConditions);
        if (combined) conditions.push(combined);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(where);
    const total = countRow?.count ?? 0;

    const items = await db
      .select()
      .from(products)
      .where(where)
      .orderBy(...sortClause(filters.sort))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const brandWhere = filters.category && filters.category !== "all"
      ? eq(products.categorySlug, filters.category)
      : undefined;
    const brandRows = await db
      .select({ brand: products.brand, count: sql<number>`count(*)::int` })
      .from(products)
      .where(brandWhere)
      .groupBy(products.brand)
      .orderBy(desc(sql`count(*)`), asc(products.brand));

    const categoryRows = await db
      .select({ slug: products.categorySlug, count: sql<number>`count(*)::int` })
      .from(products)
      .groupBy(products.categorySlug);

    return {
      items,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      brandCounts: brandRows,
      categoryCounts: categoryRows,
    };
  } catch (error) {
    console.error("[queries] getShopProducts", error);
    return empty;
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    await ready();
    const [row] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[queries] getProductBySlug", error);
    return null;
  }
}

export async function getProductReviews(slug: string): Promise<Review[]> {
  try {
    await ready();
    return await db
      .select()
      .from(reviews)
      .where(eq(reviews.productSlug, slug))
      .orderBy(desc(reviews.createdAt));
  } catch (error) {
    console.error("[queries] getProductReviews", error);
    return [];
  }
}

export async function getRelatedProducts(
  categorySlug: string,
  excludeSlug: string,
  limit = 4,
): Promise<Product[]> {
  try {
    await ready();
    return await db
      .select()
      .from(products)
      .where(and(eq(products.categorySlug, categorySlug), sql`${products.slug} <> ${excludeSlug}`))
      .orderBy(desc(products.rating))
      .limit(limit);
  } catch (error) {
    console.error("[queries] getRelatedProducts", error);
    return [];
  }
}

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  try {
    await ready();
    return await db
      .select()
      .from(products)
      .where(eq(products.featured, true))
      .orderBy(desc(products.rating), asc(products.price))
      .limit(limit);
  } catch (error) {
    console.error("[queries] getFeaturedProducts", error);
    return [];
  }
}

export async function getNewArrivals(limit = 4): Promise<Product[]> {
  try {
    await ready();
    return await db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("[queries] getNewArrivals", error);
    return [];
  }
}

export async function getAllProducts(): Promise<Product[]> {
  try {
    await ready();
    return await db.select().from(products).orderBy(asc(products.name));
  } catch (error) {
    console.error("[queries] getAllProducts", error);
    return [];
  }
}

export async function getStorefrontStats(): Promise<{
  productCount: number;
  categoryCount: number;
  reviewCount: number;
  avgRating: number;
}> {
  try {
    await ready();
    const [productRow] = await db.select({ count: sql<number>`count(*)::int` }).from(products);
    const [categoryRow] = await db.select({ count: sql<number>`count(*)::int` }).from(categories);
    const [reviewRow] = await db
      .select({ count: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(rating), 0)::float` })
      .from(reviews);
    return {
      productCount: productRow?.count ?? 0,
      categoryCount: categoryRow?.count ?? 0,
      reviewCount: reviewRow?.count ?? 0,
      avgRating: Math.round((reviewRow?.avg ?? 0) * 10) / 10,
    };
  } catch (error) {
    console.error("[queries] getStorefrontStats", error);
    return { productCount: 0, categoryCount: 0, reviewCount: 0, avgRating: 0 };
  }
}

export async function getLatestReviews(limit = 6): Promise<Array<Review & { productName: string }>> {
  try {
    await ready();
    const rows = await db
      .select({
        review: reviews,
        productName: products.name,
      })
      .from(reviews)
      .leftJoin(products, eq(products.slug, reviews.productSlug))
      .where(gte(reviews.rating, 5))
      .orderBy(desc(reviews.createdAt))
      .limit(limit);
    return rows.map((row) => ({ ...row.review, productName: row.productName ?? "Glowing Space BD" }));
  } catch (error) {
    console.error("[queries] getLatestReviews", error);
    return [];
  }
}

export async function recalculateProductRating(slug: string): Promise<void> {
  await db
    .update(products)
    .set({
      rating: sql`(select coalesce(avg(rating), 0)::float from ${reviews} where ${reviews.productSlug} = ${slug})`,
      reviewCount: sql`(select count(*)::int from ${reviews} where ${reviews.productSlug} = ${slug})`,
    })
    .where(eq(products.slug, slug));
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
  }>;
}): Promise<Order> {
  const { items, ...orderValues } = input;
  const orderNumber = `GSBD-${Math.floor(10500 + Math.random() * 89400)}`;
  const [created] = await db
    .insert(orders)
    .values({ ...orderValues, orderNumber, status: "confirmed" })
    .returning();

  if (items.length > 0) {
    await db.insert(orderItems).values(items.map((item) => ({ ...item, orderId: created.id })));
  }
  return created;
}

export async function getOrderByNumber(
  orderNumber: string,
): Promise<{ order: Order; items: OrderItem[] } | null> {
  try {
    await ready();
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber.trim().toUpperCase()))
      .limit(1);
    if (!order) return null;
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    return { order, items };
  } catch (error) {
    console.error("[queries] getOrderByNumber", error);
    return null;
  }
}
