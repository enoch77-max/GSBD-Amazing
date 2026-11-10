import { sql } from "drizzle-orm";
import { db } from "./index";
import { categories, orderItems, orders, products, reviews } from "./schema";
import { buildProductSeeds, buildReviewSeeds, categorySeeds, orderSeeds } from "./seed-data";

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((error) => {
      seedPromise = null;
      console.error("[seed] failed", error);
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(products);
  if ((row?.count ?? 0) > 0) return;

  await db.insert(categories).values(categorySeeds).onConflictDoNothing();
  await db.insert(products).values(buildProductSeeds()).onConflictDoNothing();
  await db.insert(reviews).values(buildReviewSeeds());

  for (const seed of orderSeeds) {
    const { daysAgo, ...orderValues } = seed.order;
    const createdAt = new Date(Date.now() - daysAgo * 86400000);
    const [created] = await db
      .insert(orders)
      .values({ ...orderValues, createdAt })
      .onConflictDoNothing()
      .returning({ id: orders.id });
    if (created) {
      await db
        .insert(orderItems)
        .values(seed.items.map((item) => ({ ...item, orderId: created.id })));
    }
  }

  console.log("[seed] storefront catalog seeded");
}
