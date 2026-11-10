import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import {
  DELIVERY_METHODS,
  PAYMENT_METHODS,
  STORE,
  deliveryPrice,
  findPromo,
  promoDiscount,
  type DeliveryMethod,
} from "@/lib/commerce";
import { createOrder } from "@/lib/queries";

export const dynamic = "force-dynamic";

type OrderPayload = {
  customerName?: string;
  phone?: string;
  email?: string;
  district?: string;
  address?: string;
  notes?: string;
  paymentMethod?: string;
  deliveryMethod?: string;
  promoCode?: string;
  items?: Array<{ slug?: string; qty?: number }>;
};

export async function POST(request: Request) {
  let payload: OrderPayload;
  try {
    payload = (await request.json()) as OrderPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const customerName = payload.customerName?.trim() ?? "";
  const phone = payload.phone?.trim() ?? "";
  const district = payload.district?.trim() ?? "";
  const address = payload.address?.trim() ?? "";
  const items = (payload.items ?? []).filter(
    (item): item is { slug: string; qty: number } =>
      typeof item.slug === "string" && Number.isFinite(Number(item.qty)),
  );

  if (customerName.length < 3) {
    return NextResponse.json({ error: "Please tell us your full name." }, { status: 400 });
  }
  if (!/^01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, ""))) {
    return NextResponse.json({ error: "Enter a valid 11-digit Bangladeshi mobile number." }, { status: 400 });
  }
  if (!district || address.length < 10) {
    return NextResponse.json({ error: "Add a district and a full delivery address." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });
  }

  const paymentMethod = PAYMENT_METHODS.some((method) => method.id === payload.paymentMethod)
    ? (payload.paymentMethod as string)
    : "cod";
  const deliveryMethod: DeliveryMethod = DELIVERY_METHODS.some(
    (method) => method.id === payload.deliveryMethod,
  )
    ? (payload.deliveryMethod as DeliveryMethod)
    : "standard";

  try {
    await ensureSeeded();

    const slugs = Array.from(new Set(items.map((item) => item.slug)));
    const rows = await db.select().from(products).where(inArray(products.slug, slugs));
    const lookup = new Map(rows.map((row) => [row.slug, row]));

    const lineItems = [];
    for (const item of items) {
      const product = lookup.get(item.slug);
      if (!product) {
        return NextResponse.json(
          { error: "One of the items in your bag is no longer available." },
          { status: 409 },
        );
      }
      const qty = Math.max(1, Math.min(20, Math.floor(Number(item.qty) || 1)));
      if (product.stock <= 0) {
        return NextResponse.json(
          { error: `${product.name} went out of stock. Please remove it and try again.` },
          { status: 409 },
        );
      }
      lineItems.push({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.images[0] ?? "/images/col-cells.jpg",
        unitPrice: product.price,
        qty: Math.min(qty, product.stock),
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
    let shipping = deliveryPrice(deliveryMethod, district);
    if (deliveryMethod === "standard" && subtotal >= STORE.freeShippingThreshold) shipping = 0;

    const promo = findPromo(payload.promoCode ?? "");
    const discount = promoDiscount(promo, subtotal);
    if (promo?.type === "shipping" && discount >= 0 && subtotal >= promo.minSubtotal) shipping = 0;
    const total = Math.max(0, subtotal + shipping - discount);

    const order = await createOrder({
      customerName,
      phone: phone.replace(/[\s-]/g, ""),
      email: payload.email?.trim() || null,
      district,
      address,
      notes: payload.notes?.trim() || null,
      paymentMethod,
      deliveryMethod,
      promoCode: promo && discount > 0 ? promo.code : null,
      subtotal,
      shipping,
      discount,
      total,
      items: lineItems,
    });

    return NextResponse.json(
      {
        ok: true,
        orderNumber: order.orderNumber,
        total: order.total,
        shipping: order.shipping,
        discount: order.discount,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/orders]", error);
    return NextResponse.json(
      { error: "We could not place the order. Please try again or message us on WhatsApp." },
      { status: 500 },
    );
  }
}
