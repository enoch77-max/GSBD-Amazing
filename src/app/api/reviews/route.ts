import { NextResponse } from "next/server";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { getProductBySlug, recalculateProductRating } from "@/lib/queries";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

type Payload = {
  productSlug?: string;
  author?: string;
  location?: string;
  rating?: number;
  title?: string;
  body?: string;
};

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const productSlug = payload.productSlug?.trim();
  const author = payload.author?.trim();
  const title = payload.title?.trim();
  const body = payload.body?.trim();
  const rating = Number(payload.rating);

  if (!productSlug || !author || !title || !body) {
    return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
  }
  if (author.length > 60 || title.length > 90 || body.length > 900) {
    return NextResponse.json({ error: "Please keep your review a little shorter." }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Choose a rating between 1 and 5 stars." }, { status: 400 });
  }

  try {
    await ensureSeeded();
    const product = await getProductBySlug(productSlug);
    if (!product) {
      return NextResponse.json({ error: "That product no longer exists." }, { status: 404 });
    }

    const [created] = await db
      .insert(reviews)
      .values({
        productSlug,
        author,
        location: payload.location?.trim() || "Dhaka",
        rating,
        title,
        body,
        verified: false,
      })
      .returning();

    await recalculateProductRating(productSlug);

    return NextResponse.json({ ok: true, review: created }, { status: 201 });
  } catch (error) {
    console.error("[api/reviews]", error);
    return NextResponse.json({ error: "Could not save your review right now." }, { status: 500 });
  }
}
