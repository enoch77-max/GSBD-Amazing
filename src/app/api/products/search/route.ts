import { NextResponse } from "next/server";
import { and, desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    await ensureSeeded();
    const term = `%${query}%`;
    const rows = await db
      .select({
        slug: products.slug,
        name: products.name,
        brand: products.brand,
        price: products.price,
        images: products.images,
        rating: products.rating,
        stock: products.stock,
      })
      .from(products)
      .where(
        and(
          sql`${products.stock} >= 0`,
          or(
            ilike(products.name, term),
            ilike(products.brand, term),
            ilike(products.shortDescription, term),
            ilike(products.categorySlug, term),
          ),
        ),
      )
      .orderBy(desc(products.featured), desc(products.rating))
      .limit(6);

    return NextResponse.json({
      results: rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        brand: row.brand,
        price: row.price,
        image: row.images[0] ?? "/images/col-cells.jpg",
        rating: row.rating,
        stock: row.stock,
      })),
    });
  } catch (error) {
    console.error("[api/products/search]", error);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
