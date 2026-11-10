import { NextResponse } from "next/server";
import { and, asc, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(products)
      .where(
        and(
          sql`${products.stock} > 0`,
          inArray(products.categorySlug, ["bms-circuits", "tools-safety", "diy-prototyping"]),
          sql`${products.price} < 1500`,
        ),
      )
      .orderBy(asc(products.price))
      .limit(3);

    return NextResponse.json({
      products: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        brand: row.brand,
        price: row.price,
        image: row.images[0] ?? "/images/col-cells.jpg",
        stock: row.stock,
      })),
    });
  } catch (error) {
    console.error("[api/products/upsell]", error);
    return NextResponse.json({ products: [] });
  }
}
