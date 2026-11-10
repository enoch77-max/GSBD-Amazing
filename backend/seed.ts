/**
 * Seeds an empty database: catalogue (from the shared seed module), default
 * promos and default store settings. Idempotent — safe to run on every boot.
 * Production starts with zero orders; demo history stays in the preview only.
 */
import { buildProductSeeds, buildReviewSeeds, categorySeeds } from "../src/db/seed-data";
import { PROMOS } from "../src/lib/commerce";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { query, queryOne } from "./db";

export async function seedAll(): Promise<{ categories: number; products: number; reviews: number; promos: number }> {
  const counts = { categories: 0, products: 0, reviews: 0, promos: 0 };

  const existingCategories = new Set(
    (await query<{ slug: string }>("SELECT slug FROM categories")).map((row) => row.slug),
  );
  for (const [index, seed] of categorySeeds.entries()) {
    if (existingCategories.has(seed.slug)) continue;
    await query(
      "INSERT INTO categories (slug, name, tagline, description, image, icon, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [seed.slug, seed.name, seed.tagline, seed.description, seed.image, seed.icon ?? "battery", seed.sortOrder ?? index + 1],
    );
    counts.categories += 1;
  }

  const existingProducts = new Set(
    (await query<{ slug: string }>("SELECT slug FROM products")).map((row) => row.slug),
  );
  for (const seed of buildProductSeeds()) {
    if (!seed.slug || existingProducts.has(seed.slug)) continue;
    await query(
      `INSERT INTO products (slug, name, brand, category_slug, short_description, description, price,
        compare_at_price, stock, rating, review_count, badge, highlights, specs, images, featured,
        warranty_months, sku, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        seed.slug, seed.name, seed.brand, seed.categorySlug, seed.shortDescription, seed.description,
        seed.price, seed.compareAtPrice ?? null, seed.stock ?? 0, seed.rating ?? 0, seed.reviewCount ?? 0,
        seed.badge ?? null, JSON.stringify(seed.highlights ?? []), JSON.stringify(seed.specs ?? []),
        JSON.stringify(seed.images ?? []), seed.featured ?? false, seed.warrantyMonths ?? 3,
        seed.sku, seed.createdAt ?? new Date(),
      ],
    );
    counts.products += 1;
  }

  const reviewCount = await queryOne<{ count: string }>("SELECT count(*)::text AS count FROM reviews");
  if (reviewCount?.count === "0") {
    for (const seed of buildReviewSeeds()) {
      const createdAt =
        (seed as { createdAt?: Date }).createdAt ?? new Date(Date.now() - seed.daysAgo * 86400000);
      await query(
        "INSERT INTO reviews (product_slug, author, location, rating, title, body, verified) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [seed.productSlug, seed.author, seed.location ?? "Dhaka", seed.rating, seed.title, seed.body, seed.verified ?? true],
      );
      counts.reviews += 1;
      void createdAt;
    }
    /* Backdate proportionally so newest-first ordering looks natural. */
    await query("UPDATE reviews SET created_at = NOW() - (id || ' hours')::interval WHERE created_at > NOW() - interval '1 minute'");
  }

  for (const promo of PROMOS) {
    const inserted = await query(
      `INSERT INTO promos (code, label, type, value, min_subtotal, max_discount, active, per_phone_limit)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,1) ON CONFLICT (code) DO NOTHING RETURNING code`,
      [promo.code, promo.label, promo.type, promo.value, promo.minSubtotal, promo.maxDiscount ?? null],
    );
    counts.promos += inserted.length;
  }

  await query("INSERT INTO settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING", [
    JSON.stringify(DEFAULT_SETTINGS),
  ]);

  return counts;
}
